'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabase/client';

export default function AuthForm() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function sendCode() {
    const normalized = phone.replace(/[\\s()-]/g, '');
    if (!/^\\+[1-9]\\d{7,14}$/.test(normalized)) {
      setMessage('Country code ke saath valid phone number enter karein, jaise +919XXXXXXXXX.');
      return;
    }
    setBusy(true); setMessage('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (error) { setMessage('OTP send nahi hua. Phone OTP provider configuration check karein.'); return; }
    setPhone(normalized); setSent(true); setMessage('OTP request sent. SMS receive hone par code enter karein.');
  }

  async function verifyCode() {
    if (!/^\\d{4,8}$/.test(code)) { setMessage('Valid OTP enter karein.'); return; }
    setBusy(true); setMessage('');
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    setBusy(false);
    if (error) { setMessage('OTP verify nahi hua. Code check karke dobara try karein.'); return; }
    setMessage('Phone verified. Aap signed in hain.');
    window.location.reload();
  }

  async function signOut() {
    setBusy(true);
    const { error } = await createClient().auth.signOut();
    setBusy(false);
    setMessage(error ? 'Sign out nahi ho saka.' : 'You are signed out.');
    if (!error) window.location.reload();
  }

  return <section className="auth-card" id="customer-account">
    <div><p className="eyebrow">CUSTOMER ACCOUNT</p><h2>Order with confidence.</h2></div>
    <p>Phone OTP sign-in checkout aur order history ke liye account verify karega.</p>
    {!sent ? <div className="auth-controls"><input aria-label="Phone number with country code" placeholder="+91XXXXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel"/><button disabled={busy} onClick={sendCode}>{busy ? 'Sending…' : 'Send OTP'}</button></div> : <div className="auth-controls"><input aria-label="SMS verification code" placeholder="Enter OTP" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)}/><button disabled={busy} onClick={verifyCode}>{busy ? 'Verifying…' : 'Verify OTP'}</button></div>}
    <button className="auth-reset" onClick={() => { setSent(false); setCode(''); setMessage(''); }}>Change phone number</button>
    <button className="auth-reset" disabled={busy} onClick={signOut}>Sign out</button>
    {message && <p className="auth-message" role="status">{message}</p>}
    <small>OTP delivery depends on the restaurant project's Supabase phone provider and SMS configuration. No order is placed by signing in.</small>
  </section>;
}
