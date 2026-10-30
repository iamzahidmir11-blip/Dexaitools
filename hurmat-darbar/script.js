import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://rvrboufrnkzuptfjopwd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_n1PWbHcomKpd63FPDdWSEw_iSo6UTi0";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

document.getElementById("year").textContent = new Date().getFullYear();
const menuButton = document.querySelector(".hamb");
menuButton.addEventListener("click", () => document.querySelector(".top").classList.toggle("nav-open"));
document.querySelectorAll(".top nav a").forEach((a) => a.addEventListener("click", () => document.querySelector(".top").classList.remove("nav-open")));

const categoryRoot = document.getElementById("menu-categories");
const menuGrid = document.getElementById("menu-grid");
const menuStatus = document.getElementById("menu-status");
let selectedCategory = "all";
let menuItems = [];

function addText(parent, tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value ?? "";
  parent.appendChild(el);
  return el;
}

function renderCategories(categories) {
  categoryRoot.replaceChildren();
  const all = document.createElement("button");
  all.className = "chip active";
  all.dataset.cat = "all";
  all.textContent = "All categories";
  categoryRoot.appendChild(all);
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.className = "chip";
    button.dataset.cat = category.id;
    button.textContent = category.name;
    categoryRoot.appendChild(button);
  });
  categoryRoot.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cat]");
    if (!button) return;
    selectedCategory = button.dataset.cat;
    categoryRoot.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    renderMenu();
  });
}

function renderMenu() {
  menuGrid.replaceChildren();
  const visible = menuItems.filter((item) => selectedCategory === "all" || item.category_id === selectedCategory);
  if (!visible.length) {
    addText(menuGrid, "div", "menu-empty", "No menu items are currently listed in this category.");
    return;
  }
  visible.forEach((item) => {
    const card = document.createElement("article");
    card.className = "menu-card";
    const info = document.createElement("div");
    const tag = item.is_veg === true ? "VEG" : item.is_veg === false ? "NON-VEG" : "";
    if (tag) addText(info, "span", "food-tag" + (tag === "NON-VEG" ? " nonveg" : ""), tag);
    addText(info, "h3", "", item.name);
    if (item.description) addText(info, "p", "", item.description);
    const prices = document.createElement("div");
    prices.className = "price-list";
    item.menu_variants.forEach((variant) => {
      const price = document.createElement("div");
      price.className = "price";
      price.textContent = variant.price == null ? "Price on request" : "₹" + variant.price;
      addText(price, "span", "variant", variant.label);
      prices.appendChild(price);
    });
    card.append(info, prices);
    menuGrid.appendChild(card);
  });
}

async function loadMenu() {
  menuStatus.textContent = "Loading the restaurant menu…";
  const [{ data: categories, error: categoryError }, { data: items, error: itemError }] = await Promise.all([
    supabase.from("menu_categories").select("id,name,sort_order").eq("active", true).order("sort_order"),
    supabase.from("menu_items").select("id,category_id,name,description,is_veg,sort_order,menu_variants(id,label,price,sort_order)").eq("active", true).eq("available", true).eq("needs_verification", false).order("sort_order")
  ]);
  if (categoryError || itemError) {
    menuStatus.textContent = "The menu is temporarily unavailable. Please call the restaurant for current items and prices.";
    return;
  }
  const safeCategories = categories ?? [];
  menuItems = (items ?? []).map((item) => ({
    ...item,
    menu_variants: (item.menu_variants ?? []).filter((variant) => variant.price !== null)
      .sort((a, b) => a.sort_order - b.sort_order)
  })).filter((item) => item.menu_variants.length > 0);
  renderCategories(safeCategories);
  menuStatus.textContent = menuItems.length
    ? "Menu loaded from Hurmat Darbar's live database."
    : "Menu items are being verified. Please call the restaurant.";
  renderMenu();
}

loadMenu();
