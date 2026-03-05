'use client';

import { useEffect, useMemo, useState } from 'react';

const TABS = ['billing', 'inventory', 'orders', 'dashboard', 'admin'];

const authHeaders = (user) => ({
  'Content-Type': 'application/json',
  'x-user-id': user?._id || '',
  'x-user-role': user?.role || ''
});

const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

export default function Home() {
  const [tab, setTab] = useState('billing');
  const [user, setUser] = useState(null);
  const [login, setLogin] = useState({ username: '', password: '' });
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', warehouseName: '', warehouseLocation: '' });

  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);

  const [bill, setBill] = useState({ date: new Date().toISOString().slice(0, 10), partyName: '', gstNumber: '', items: [] });
  const [transfer, setTransfer] = useState({ fromWarehouseId: '', toWarehouseId: '', productId: '', quantity: 0 });
  const [adjust, setAdjust] = useState({ productId: '', delta: 0 });

  const loadAll = async (u = user, wh = selectedWarehouse) => {
    if (!u) return;
    const h = authHeaders(u);
    const [pRes, wRes, oRes] = await Promise.all([
      fetch('/api/products', { headers: h }),
      fetch(`/api/warehouses${u.role === 'admin' ? '' : ''}`, { headers: h }),
      fetch('/api/orders', { headers: h })
    ]);
    const [p, w, o] = await Promise.all([pRes.json(), wRes.json(), oRes.json()]);
    setProducts(Array.isArray(p) ? p : []);
    setWarehouses(Array.isArray(w) ? w : []);
    setOrders(Array.isArray(o) ? o : []);

    const nextWh = wh || (Array.isArray(w) && w[0]?._id) || '';
    setSelectedWarehouse(nextWh);
    if (nextWh) {
      const iRes = await fetch(`/api/inventory?warehouseId=${nextWh}`, { headers: h });
      const i = await iRes.json();
      setInventory(Array.isArray(i) ? i : []);
    } else {
      setInventory([]);
    }

    if (Array.isArray(p) && p[0] && bill.items.length === 0) {
      setBill((prev) => ({ ...prev, items: [{ productId: p[0]._id, qty: 1 }] }));
    }

    if (u.role === 'admin') {
      const uRes = await fetch('/api/users', { headers: h });
      const uList = await uRes.json();
      setUsers(Array.isArray(uList) ? uList : []);
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem('erp_user');
    if (cached) {
      const parsed = JSON.parse(cached);
      setUser(parsed);
    }
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('erp_user', JSON.stringify(user));
      loadAll(user);
    }
  }, [user]);

  const loginSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(login) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Login failed');
    setUser(data.user);
  };

  const billRows = useMemo(() => {
    return bill.items.map((it) => {
      const p = products.find((x) => x._id === it.productId);
      return p ? { ...it, name: p.name, price: p.price, amount: p.price * Number(it.qty || 0) } : null;
    }).filter(Boolean);
  }, [bill, products]);

  const totals = useMemo(() => {
    const subtotal = billRows.reduce((s, r) => s + r.amount, 0);
    const gst = subtotal * 0.18;
    return { subtotal, gst, total: subtotal + gst };
  }, [billRows]);

  const saveBill = async () => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ ...bill, warehouseId: selectedWarehouse, items: bill.items })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed');
    alert(`Saved ${data.orderId}`);
    await loadAll();
  };

  const deleteBill = async (id) => {
    const res = await fetch(`/api/orders?id=${id}`, { method: 'DELETE', headers: authHeaders(user) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Delete failed');
    await loadAll();
  };

  const patchInventory = async (productId, quantity) => {
    const res = await fetch('/api/inventory', {
      method: 'PATCH',
      headers: authHeaders(user),
      body: JSON.stringify({ warehouseId: selectedWarehouse, productId, quantity: Number(quantity) })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Inventory update failed');
    await loadAll();
  };

  const adjustInventory = async () => {
    const res = await fetch('/api/inventory/adjust', {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ warehouseId: selectedWarehouse, productId: adjust.productId, delta: Number(adjust.delta) })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Adjustment failed');
    await loadAll();
  };

  const transferInventory = async () => {
    const res = await fetch('/api/inventory/transfer', {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ ...transfer, quantity: Number(transfer.quantity) })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Transfer failed');
    await loadAll();
  };

  const createUser = async () => {
    const res = await fetch('/api/users', { method: 'POST', headers: authHeaders(user), body: JSON.stringify(newUser) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'User create failed');
    setNewUser({ username: '', password: '', warehouseName: '', warehouseLocation: '' });
    await loadAll();
  };

  const createWarehouse = async () => {
    const name = prompt('Warehouse name');
    if (!name) return;
    const location = prompt('Warehouse location') || '';
    const res = await fetch('/api/warehouses', {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ name, location, ownerUserId: user.role === 'admin' ? prompt('Owner user id (blank for admin)') || user._id : user._id })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Warehouse create failed');
    await loadAll();
  };

  if (!user) {
    return (
      <main className="app-shell"><section className="card login-card"><h2>Login</h2><form onSubmit={loginSubmit}><input placeholder="username" value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} /><input type="password" placeholder="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /><button type="submit">Login</button></form></section></main>
    );
  }

  return (
    <main className="app-shell">
      <header className="header"><h1>GAURI AGRO ERP ({user.role})</h1><button onClick={() => { localStorage.removeItem('erp_user'); setUser(null); }}>Logout</button></header>

      <div className="tabs">{TABS.filter((t) => user.role === 'admin' || t !== 'admin').map((t) => <button key={t} className={tab===t?'tab active':'tab'} onClick={() => setTab(t)}>{t}</button>)}</div>

      <section className="card">
        <h3>Warehouse</h3>
        <select value={selectedWarehouse} onChange={(e) => { setSelectedWarehouse(e.target.value); loadAll(user, e.target.value); }}>
          {warehouses.map((w) => <option key={w._id} value={w._id}>{w.name} - {w.location}</option>)}
        </select>
        <button onClick={createWarehouse}>+ Add Warehouse</button>
      </section>

      {tab === 'billing' && <section className="card"><h2>Create Bill</h2><input placeholder="Party" value={bill.partyName} onChange={(e) => setBill({ ...bill, partyName: e.target.value })} /><input placeholder="GST optional" value={bill.gstNumber} onChange={(e) => setBill({ ...bill, gstNumber: e.target.value })} /><input type="date" value={bill.date} onChange={(e) => setBill({ ...bill, date: e.target.value })} />{bill.items.map((it, idx)=><div className="line-item" key={idx}><select value={it.productId} onChange={(e)=>setBill({...bill, items: bill.items.map((x,i)=>i===idx?{...x, productId:e.target.value}:x)})}>{products.map((p)=><option key={p._id} value={p._id}>{p.name}</option>)}</select><input type="number" min="1" value={it.qty} onChange={(e)=>setBill({...bill, items: bill.items.map((x,i)=>i===idx?{...x, qty:Number(e.target.value)}:x)})} /></div>)}<button onClick={()=>setBill({...bill, items:[...bill.items,{productId:products[0]?._id||'', qty:1}]})}>+ Item</button><p>Total: {fmt(totals.total)}</p><button onClick={saveBill}>Save Bill (deduct from selected warehouse)</button></section>}

      {tab === 'inventory' && <section className="card"><h2>Inventory Manual Manage</h2><div className="line-item"><select value={adjust.productId} onChange={(e)=>setAdjust({...adjust, productId:e.target.value})}><option value="">select product</option>{products.map((p)=><option key={p._id} value={p._id}>{p.name}</option>)}</select><input type="number" value={adjust.delta} onChange={(e)=>setAdjust({...adjust, delta:Number(e.target.value)})} /><button onClick={adjustInventory}>Adjust +/-</button></div><table><thead><tr><th>Product</th><th>Qty</th><th>Set Qty</th></tr></thead><tbody>{inventory.map((r)=><tr key={r._id}><td>{r.product?.name}</td><td>{r.quantity}</td><td><input type="number" defaultValue={r.quantity} onBlur={(e)=>patchInventory(r.productId, Number(e.target.value))} /></td></tr>)}</tbody></table></section>}

      {tab === 'orders' && <section className="card"><h2>Orders</h2><table><thead><tr><th>ID</th><th>Warehouse</th><th>Party</th><th>Total</th><th>Action</th></tr></thead><tbody>{orders.map((o)=><tr key={o._id}><td>{o.orderId}</td><td>{o.warehouseId}</td><td>{o.partyName}</td><td>{fmt(o.total)}</td><td><button onClick={()=>deleteBill(o._id)}>Delete bill (restore stock)</button></td></tr>)}</tbody></table></section>}

      {tab === 'dashboard' && <section className="card"><h2>Dashboard</h2><p>Total Orders: {orders.length}</p><p>Total Sales: {fmt(orders.reduce((s,o)=>s+o.total,0))}</p></section>}

      {tab === 'admin' && user.role === 'admin' && <section className="card"><h2>Admin User Management</h2><div className="line-item"><input placeholder="username" value={newUser.username} onChange={(e)=>setNewUser({...newUser, username:e.target.value})} /><input placeholder="password" value={newUser.password} onChange={(e)=>setNewUser({...newUser, password:e.target.value})} /><input placeholder="first warehouse name" value={newUser.warehouseName} onChange={(e)=>setNewUser({...newUser, warehouseName:e.target.value})} /><input placeholder="first warehouse location" value={newUser.warehouseLocation} onChange={(e)=>setNewUser({...newUser, warehouseLocation:e.target.value})} /><button onClick={createUser}>Create User</button></div><h3>Users</h3>{users.map((u)=><p key={u._id}>{u.username} ({u._id})</p>)}<h3>Refill / Transfer Inventory (Admin warehouse → user warehouse)</h3><div className="line-item"><select value={transfer.fromWarehouseId} onChange={(e)=>setTransfer({...transfer, fromWarehouseId:e.target.value})}><option value="">from warehouse</option>{warehouses.map((w)=><option key={w._id} value={w._id}>{w.name}</option>)}</select><input placeholder="to warehouse id" value={transfer.toWarehouseId} onChange={(e)=>setTransfer({...transfer, toWarehouseId:e.target.value})} /><select value={transfer.productId} onChange={(e)=>setTransfer({...transfer, productId:e.target.value})}><option value="">product</option>{products.map((p)=><option key={p._id} value={p._id}>{p.name}</option>)}</select><input type="number" value={transfer.quantity} onChange={(e)=>setTransfer({...transfer, quantity:Number(e.target.value)})} /><button onClick={transferInventory}>Transfer</button></div></section>}
    </main>
  );
}
