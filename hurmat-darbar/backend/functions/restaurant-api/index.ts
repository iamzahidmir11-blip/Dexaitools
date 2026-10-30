import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return reply({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply({ error: "authentication_required" }, 401);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const keyMapRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    let anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (keyMapRaw) {
      try {
        const keyMap = JSON.parse(keyMapRaw);
        anonKey = Deno.env.get(keyMap.default) ?? anonKey;
      } catch {
        return reply({ error: "server_configuration_error" }, 500);
      }
    }
    if (!url || !anonKey) return reply({ error: "server_configuration_error" }, 500);

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user) return reply({ error: "invalid_session" }, 401);

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role, active")
      .eq("user_id", user.id)
      .eq("active", true);

    if (roleError) return reply({ error: "authorization_check_failed" }, 500);
    const roles = new Set((roleRows ?? []).map((row: { role: string }) => row.role));

    if (req.method === "GET") {
      const view = new URL(req.url).searchParams.get("view") ?? "orders";
      if (view === "menu" || view === "reservations") {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (view === "menu") {
          const { data, error } = await supabase.from("menu_items")
            .select("id, name, description, is_veg, active, available, needs_verification, menu_categories(name), menu_variants(id, label, price, active)")
            .order("name", { ascending: true }).limit(300);
          if (error) return reply({ error: "menu_unavailable" }, 500);
          return reply({ items: data ?? [] });
        }
        const { data, error } = await supabase.from("reservations")
          .select("id, name, phone, party_size, reserve_at, notes, status, created_at")
          .order("reserve_at", { ascending: true }).limit(200);
        if (error) return reply({ error: "reservations_unavailable" }, 500);
        return reply({ reservations: data ?? [] });
      }
      if (view === "riders") {
        if (![...roles].some((r) => ["owner", "manager", "delivery_manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        const { data, error } = await supabase.from("riders").select("user_id, name, phone, is_online, last_seen").order("name");
        if (error) return reply({ error: "riders_unavailable" }, 500);
        return reply({ riders: data ?? [] });
      }
      if (![...roles].some((r) => ["owner", "manager", "kitchen", "delivery_manager", "rider"].includes(r))) return reply({ error: "forbidden" }, 403);
      let orderQuery = supabase.from("orders")
        .select("id, order_no, customer_name, customer_phone, address_text, lat, lng, notes, payment_method, payment_status, status, subtotal, delivery_fee, total, rider_id, created_at, updated_at, order_items(id, item_name, variant_label, unit_price, qty, line_total)");
      if (roles.has("rider") && ![...roles].some((r) => ["owner", "manager", "kitchen", "delivery_manager"].includes(r))) {
        orderQuery = orderQuery.eq("rider_id", user.id);
      }
      const { data, error } = await orderQuery.order("created_at", { ascending: false }).limit(100);
      if (error) return reply({ error: "orders_unavailable" }, 500);
      return reply({ orders: data ?? [] });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply({ error: "invalid_json_body" }, 400);
    }

    switch (body.action) {

      case "set_rider_availability": {
        if (!roles.has("rider") || typeof body.is_online !== "boolean") return reply({ error: "forbidden_or_invalid_availability" }, 403);
        const { error } = await supabase.from("riders").update({ is_online: body.is_online, last_seen: new Date().toISOString() }).eq("user_id", user.id);
        if (error) return reply({ error: "availability_update_failed" }, 400);
        return reply({ ok: true, is_online: body.is_online });
      }

      case "update_menu_item": {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.item_id)) return reply({ error: "invalid_item_id" }, 400);
        const patch: Record<string, unknown> = {};
        if (typeof body.available === "boolean") patch.available = body.available;
        if (typeof body.active === "boolean") patch.active = body.active;
        if (typeof body.name === "string" && body.name.trim().length >= 2 && body.name.length <= 120) patch.name = body.name.trim();
        if (typeof body.description === "string" && body.description.length <= 500) patch.description = body.description;
        if (!Object.keys(patch).length) return reply({ error: "no_valid_changes" }, 400);
        const { data: updated, error } = await supabase.from("menu_items")
          .update(patch).eq("id", body.item_id).select("id").maybeSingle();
        if (error) return reply({ error: "menu_update_failed" }, 400);
        if (!updated) return reply({ error: "menu_item_not_found_or_not_visible" }, 404);
        return reply({ ok: true, item_id: updated.id });
      }
      case "update_menu_variant": {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.variant_id)) return reply({ error: "invalid_variant_id" }, 400);
        const patch: Record<string, unknown> = {};
        if (typeof body.active === "boolean") patch.active = body.active;
        if (Number.isInteger(body.price) && body.price > 0 && body.price <= 1000000) patch.price = body.price;
        if (typeof body.label === "string" && body.label.trim() && body.label.length <= 60) patch.label = body.label.trim();
        if (!Object.keys(patch).length) return reply({ error: "no_valid_changes" }, 400);
        const { data: updated, error } = await supabase.from("menu_variants")
          .update(patch).eq("id", body.variant_id).select("id").maybeSingle();
        if (error) return reply({ error: "variant_update_failed" }, 400);
        if (!updated) return reply({ error: "menu_variant_not_found_or_not_visible" }, 404);
        return reply({ ok: true, variant_id: updated.id });
      }
      case "update_reservation_status": {
        if (![...roles].some((r) => ["owner", "manager"].includes(r))) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.reservation_id) || !["confirmed", "rejected", "cancelled", "pending"].includes(body.status)) return reply({ error: "invalid_reservation_update" }, 400);
        const { data: updated, error } = await supabase.from("reservations")
          .update({ status: body.status }).eq("id", body.reservation_id).select("id").maybeSingle();
        if (error) return reply({ error: "reservation_update_failed" }, 400);
        if (!updated) return reply({ error: "reservation_not_found_or_not_visible" }, 404);
        return reply({ ok: true, reservation_id: updated.id });
      }
      case "create_order": {
        const { data, error } = await supabase.rpc("create_order", { p: body.order });
        if (error) return reply({ error: "order_creation_failed", code: error.message }, 400);
        return reply({ order: data }, 201);
      }

      case "assign_rider": {
        if (![...roles].some((r) => ["owner", "manager", "delivery_manager"].includes(r))) {
          return reply({ error: "forbidden" }, 403);
        }
        if (!isUuid(body.order_id) || !isUuid(body.rider_id)) {
          return reply({ error: "invalid_order_or_rider_id" }, 400);
        }
        const { error } = await supabase.rpc("assign_rider", {
          p_order: body.order_id,
          p_rider: body.rider_id,
        });
        if (error) return reply({ error: "assignment_failed", code: error.message }, 400);
        return reply({ ok: true });
      }

      case "update_order_status": {
        if (![...roles].some((r) => ["owner", "manager", "kitchen", "rider"].includes(r))) {
          return reply({ error: "forbidden" }, 403);
        }
        if (!isUuid(body.order_id) || typeof body.status !== "string") {
          return reply({ error: "invalid_order_or_status" }, 400);
        }
        const allowed = new Set([
          "pending_confirmation", "confirmed", "preparing", "ready_for_pickup",
          "picked_up", "out_for_delivery", "delivered", "cancelled", "rejected", "delivery_failed",
        ]);
        if (!allowed.has(body.status)) return reply({ error: "invalid_status" }, 400);
        const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : null;
        const { error } = await supabase.rpc("update_order_status", {
          p_order: body.order_id,
          p_to: body.status,
          p_reason: reason,
        });
        if (error) return reply({ error: "status_update_failed", code: error.message }, 400);
        return reply({ ok: true });
      }

      case "post_location": {
        if (!roles.has("rider")) return reply({ error: "forbidden" }, 403);
        if (!isUuid(body.order_id) || typeof body.lat !== "number" ||
            typeof body.lng !== "number" || !Number.isFinite(body.lat) ||
            !Number.isFinite(body.lng) || body.lat < -90 || body.lat > 90 ||
            body.lng < -180 || body.lng > 180) {
          return reply({ error: "invalid_location" }, 400);
        }
        const accuracy = typeof body.accuracy === "number" && Number.isFinite(body.accuracy)
          ? Math.max(0, Math.min(body.accuracy, 10000))
          : null;
        const { data, error } = await supabase.rpc("rider_post_location", {
          p_order: body.order_id,
          p_lat: body.lat,
          p_lng: body.lng,
          p_accuracy: accuracy,
        });
        if (error) return reply({ error: "location_update_failed" }, 400);
        return reply({ ok: Boolean(data) });
      }

      default:
        return reply({ error: "unknown_action" }, 400);
    }
  } catch {
    return reply({ error: "unexpected_server_error" }, 500);
  }
});
