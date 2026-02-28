'use client';

import { useEffect, useMemo, useState } from 'react';

const navItems = [
  { id: 'billing', label: 'Create Bill' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'dashboard', label: 'Sales Dashboard' },
  { id: 'orders', label: 'Orders History' }
];

const AUTH_KEY = 'gauri_admin_auth';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('billing');
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterMonth, setFilterMonth] = useState('all');

  const [partyName, setPartyName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [billDate, setBillDate] = useState(todayDate());
  const [billItems, setBillItems] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', stock: '' });

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const loadData = async () => {
    try {
      setError('');
      setIsLoading(true);
      const [inventoryRes, ordersRes] = await Promise.all([fetch('/api/inventory'), fetch('/api/orders')]);

      if (!inventoryRes.ok || !ordersRes.ok) {
        throw new Error('Failed to load data from database APIs.');
      }

      const inventoryData = await inventoryRes.json();
      const ordersData = await ordersRes.json();

      setInventory(inventoryData);
      setOrders(ordersData);
      if (!billItems.length && inventoryData.length) {
        setBillItems([{ productId: String(inventoryData[0]._id), qty: 1 }]);
      }
    } catch (loadError) {
      setError(loadError.message || 'Unable to load data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem(AUTH_KEY);
    setIsAuthenticated(token === 'admin-authenticated');
    setCheckingAuth(false);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const billPreview = useMemo(() => {
    const rows = billItems
      .map((line) => {
        const product = inventory.find((item) => String(item._id) === String(line.productId));
        if (!product) {
          return null;
        }

        const quantity = Number(line.qty || 0);
        const amount = quantity * product.price;

        return {
          ...line,
          product,
          quantity,
          amount
        };
      })
      .filter(Boolean);

    const subtotal = rows.reduce((sum, row) => sum + row.amount, 0);
    const gstAmount = subtotal * 0.05;
    const total = subtotal + gstAmount;

    return { rows, subtotal, gstAmount, total };
  }, [billItems, inventory]);

  const monthOptions = useMemo(() => {
    const months = new Set(orders.map((order) => String(order.date || '').slice(0, 7)).filter(Boolean));
    return ['all', ...Array.from(months).sort()];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (filterMonth === 'all') {
      return orders;
    }
    return orders.filter((order) => String(order.date || '').startsWith(filterMonth));
  }, [orders, filterMonth]);

  const graphData = useMemo(() => {
    const grouped = filteredOrders.reduce((acc, order) => {
      const date = order.date;
      if (!date) {
        return acc;
      }
      acc[date] = acc[date] || { date, sales: 0, orders: 0 };
      acc[date].sales += Number(order.total || 0);
      acc[date].orders += 1;
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredOrders]);

  const maxSales = Math.max(...graphData.map((item) => item.sales), 1);
  const maxOrders = Math.max(...graphData.map((item) => item.orders), 1);

  const handleBillLineChange = (index, key, value) => {
    setBillItems((prev) => prev.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  };

  const addBillLine = () => {
    const productId = inventory[0]?._id;
    if (!productId) {
      return;
    }
    setBillItems((prev) => [...prev, { productId: String(productId), qty: 1 }]);
  };

  const removeBillLine = (index) => {
    setBillItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed.');
      }

      localStorage.setItem(AUTH_KEY, data.token);
      setIsAuthenticated(true);
      setLoginForm({ username: '', password: '' });
    } catch (authError) {
      setLoginError(authError.message || 'Unable to login.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
    setOrders([]);
    setInventory([]);
  };

  const handleGenerateOrder = async () => {
    if (!partyName.trim()) {
      alert('Please enter person/company name before saving bill.');
      return;
    }

    if (!billPreview.rows.length) {
      alert('Please add at least one valid bill item.');
      return;
    }

    try {
      const payload = {
        date: billDate,
        partyName: partyName.trim(),
        gstNumber: gstNumber.trim(),
        items: billPreview.rows.map((row) => ({ productId: String(row.product._id), qty: row.quantity }))
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save bill.');
      }

      alert(`Bill saved with order ID ${data.orderId}`);
      
      // Reset bill form after saving
      setPartyName('');
      setGstNumber('');
      setBillItems([{ productId: String(inventory[0]?._id), qty: 1 }]);
      
      await loadData();
      
      // Switch tab to orders automatically so the user can download the bill
      setActiveTab('orders');
    } catch (saveError) {
      alert(saveError.message);
    }
  };

  // UPDATED: Now receives the specific 'order' object and its 'index'
  const handleDownloadPdf = (order, index) => {
    if (!order) return;

    const invoiceNo = index + 1;
    
    // Reconstruct the rows using the order items and current inventory
    const orderRows = (order.items || []).map((item) => {
      const product = inventory.find((p) => String(p._id) === String(item.productId)) || { name: 'Unknown Product', price: 0 };
      const quantity = Number(item.qty || 0);
      const amount = quantity * product.price;
      return { product, quantity, amount };
    });

    const subtotal = orderRows.reduce((sum, row) => sum + row.amount, 0);
    const gstAmount = subtotal * 0.05;
    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;
    const total = subtotal + gstAmount;

    const rowsHtml = orderRows
      .map(
        (row, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${row.product.name}</td>
            <td>31010099</td>
            <td>${row.quantity}</td>
            <td>${formatCurrency(row.product.price)}</td>
            <td>Bag</td>
            <td>${formatCurrency(row.amount)}</td>
          </tr>
        `
      )
      .join('');

    const billHtml = `
    <html>
      <head>
        <title>Tax Invoice - ${order.orderId || invoiceNo}</title>
        <style>
          body { font-family: Arial; font-size: 13px; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #000; padding: 6px; text-align: center; }
          .center { text-align: center; }
          .right { text-align: right; }
          .no-border td { border: none; text-align: left; }
        </style>
      </head>

      <body>
        <p>
          <b>Invoice No:</b> ${invoiceNo}
          <span style="float:right"><b>Date:</b> ${order.date}</span>
        </p>

        <h2 class="center">M/s GAURI AGROPRODUCE</h2>
        <p class="center">
          KHUSHALPUR ROAD, MORADABAD 244001<br/>
          GSTIN/UIN: 09ABDFG0229R1Z1<br/>
          State Name: Uttar Pradesh, Code: 09
        </p>

        <h3 class="center">TAX INVOICE</h3>

        <table class="no-border">
          <tr>
            <td>
              <b>Party:</b><br/>
              ${order.partyName}<br/>
              GST: ${order.gstNumber || 'N/A'}
            </td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th>Sl No</th>
              <th>Description of Goods</th>
              <th>HSN/SAC</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Per</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <p class="right"><b>Amount Chargeable:</b> ${formatCurrency(subtotal)}</p>

        <table>
          <thead>
            <tr>
              <th>HSN/SAC</th>
              <th>Taxable Value</th>
              <th>CGST 9%</th>
              <th>SGST 9%</th>
              <th>Total Tax</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>31010099</td>
              <td>${formatCurrency(subtotal)}</td>
              <td>${formatCurrency(cgst)}</td>
              <td>${formatCurrency(sgst)}</td>
              <td>${formatCurrency(gstAmount)}</td>
            </tr>
          </tbody>
        </table>

        <p class="right"><b>Net Amount:</b> ${formatCurrency(total)}</p>

        <h4>Bank Details</h4>
        <p>
          A/c Name: Gauri Agroproduce<br/>
          A/c Number: 0279102100002084<br/>
          IFSC Code: PUNB0027910
        </p>

        <p>
          <b>Declaration:</b><br/>
          We declare that this invoice shows the actual price of the goods described
          and that all particulars are true and correct.
        </p>

        <p style="text-align:right">
          For <b>Gauri Agroproduce</b><br/><br/>
          Authorised Signatory
        </p>

        <p class="center">This is a Computer Generated Invoice</p>

        <script>window.print()</script>
      </body>
    </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup blocked. Please allow popups for PDF export.');
      return;
    }

    printWindow.document.write(billHtml);
    printWindow.document.close();
  };

  const handleNewProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.stock) {
      alert('Please fill product name, price, and stock.');
      return;
    }

    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProduct.name,
          price: Number(newProduct.price),
          stock: Number(newProduct.stock)
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to create product.');
      }

      setNewProduct({ name: '', price: '', stock: '' });
      await loadData();
    } catch (createError) {
      alert(createError.message);
    }
  };

  if (checkingAuth) {
    return <main className="app-shell"><section className="card">Checking admin session...</section></main>;
  }

  if (!isAuthenticated) {
    return (
      <main className="app-shell">
        <section className="card login-card">
          <h2>Admin Login</h2>
          <p>Login is required to access billing, inventory, dashboard and orders.</p>
          <form onSubmit={handleLogin}>
            <label>
              Username
              <input
                value={loginForm.username}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="admin"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••"
              />
            </label>
            {loginError ? <p className="error-text">{loginError}</p> : null}
            <button type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? 'Logging in...' : 'Login as Admin'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="header">
        <img
          src="https://static.wixstatic.com/media/75f4d5_13bdb4f8642d459d842bae2db20aefad~mv2.jpg/v1/fill/w_77,h_77,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/WhatsApp%20Image%202025-06-08%20at%204_56_edited.jpg"
          alt="Gauri Agro logo"
          className="logo"
        />
        <div>
          <h1>GAURI AGRO ERP</h1>
          <p>KHUSHALPUR ROAD, MORADABAD 244001, UTTAR PRADESH, INDIA</p>
        </div>
      </header>

      <div className="top-actions">
        <button type="button" onClick={handleLogout}>Logout Admin</button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <nav className="tabs">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeTab === item.id ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {isLoading ? <section className="card">Loading data from MongoDB...</section> : null}

      {!isLoading && activeTab === 'billing' && (
        <section className="card grid">
          <div>
            <h2>Create Bill</h2>
            <label>
              Person / Company Name *
              <input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Enter customer name" />
            </label>
            <label>
              GST Number (Optional)
              <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="GSTIN" />
            </label>
            <label>
              Bill Date
              <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </label>

            <div className="line-items">
              <h3>Bill Items</h3>
              {billItems.map((line, index) => (
                <div className="line-item" key={`${index}-${line.productId}`}>
                  <select value={line.productId} onChange={(e) => handleBillLineChange(index, 'productId', e.target.value)}>
                    {inventory.map((product) => (
                      <option key={String(product._id)} value={String(product._id)}>
                        {product.name} (Stock: {product.stock})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={line.qty}
                    onChange={(e) => handleBillLineChange(index, 'qty', Number(e.target.value))}
                  />
                  <button type="button" onClick={() => removeBillLine(index)}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" onClick={addBillLine}>
                + Add Item
              </button>
            </div>

            <div className="actions">
              {/* UPDATED: Changed label since it no longer downloads automatically */}
              <button type="button" onClick={handleGenerateOrder}>
                Save Bill
              </button>
            </div>
          </div>

          <div className="preview">
            <h3>Bill Summary</h3>
            {billPreview.rows.map((row, idx) => (
              <p key={`${row.product._id}-${idx}`}>
                {row.product.name} × {row.quantity} = <strong>{formatCurrency(row.amount)}</strong>
              </p>
            ))}
            <hr />
            <p>Subtotal: {formatCurrency(billPreview.subtotal)}</p>
            <p>GST (5%): {formatCurrency(billPreview.gstAmount)}</p>
            <p className="total">Grand Total: {formatCurrency(billPreview.total)}</p>
          </div>
        </section>
      )}

      {!isLoading && activeTab === 'inventory' && (
        <section className="card">
          <h2>Inventory Management</h2>
          <div className="inventory-form">
            <input
              placeholder="Product name"
              value={newProduct.name}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Price"
              value={newProduct.price}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, price: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Stock"
              value={newProduct.stock}
              onChange={(e) => setNewProduct((prev) => ({ ...prev, stock: e.target.value }))}
            />
            <button type="button" onClick={handleNewProduct}>
              Add Product
            </button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((product) => (
                <tr key={String(product._id)}>
                  <td>{product.name}</td>
                  <td>{formatCurrency(product.price)}</td>
                  <td>{product.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!isLoading && activeTab === 'dashboard' && (
        <section className="card">
          <div className="dashboard-head">
            <h2>Sales Dashboard</h2>
            <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {month === 'all' ? 'All Months' : month}
                </option>
              ))}
            </select>
          </div>

          <div className="stats-grid">
            <article>
              <h3>Total Sales</h3>
              <p>{formatCurrency(filteredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0))}</p>
            </article>
            <article>
              <h3>Total Orders</h3>
              <p>{filteredOrders.length}</p>
            </article>
            <article>
              <h3>Average Order Value</h3>
              <p>
                {formatCurrency(
                  filteredOrders.length
                    ? filteredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0) / filteredOrders.length
                    : 0
                )}
              </p>
            </article>
          </div>

          <div className="chart-grid">
            <div className="chart-card">
              <h3>Daily Sales</h3>
              <div className="mini-chart">
                {graphData.length ? (
                  graphData.map((entry) => (
                    <div key={`sales-${entry.date}`} className="bar-wrap">
                      <div className="bar" style={{ height: `${(entry.sales / maxSales) * 100}%` }} />
                      <small>{entry.date.slice(5)}</small>
                    </div>
                  ))
                ) : (
                  <p>No sales data</p>
                )}
              </div>
            </div>

            <div className="chart-card">
              <h3>Daily Orders</h3>
              <div className="mini-chart">
                {graphData.length ? (
                  graphData.map((entry) => (
                    <div key={`orders-${entry.date}`} className="bar-wrap">
                      <div className="bar alt" style={{ height: `${(entry.orders / maxOrders) * 100}%` }} />
                      <small>{entry.date.slice(5)}</small>
                    </div>
                  ))
                ) : (
                  <p>No order data</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {!isLoading && activeTab === 'orders' && (
        <section className="card">
          <h2>Orders History</h2>
          <table>
            <thead>
              <tr>
                <th>Order NO</th>
                <th>Order ID</th>
                <th>Date</th>
                <th>Party</th>
                <th>GST</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length ? (
                orders.map((order, index) => (
                  <tr key={String(order._id)}>
                    <td> {index + 1}</td>
                    <td>{order.orderId}</td>
                    <td>{order.date}</td>
                    <td>{order.partyName}</td>
                    <td>{order.gstNumber || 'N/A'}</td>
                    <td>{formatCurrency(order.total)}</td>
                    <td>
                      {/* UPDATED: Passing the current order and index directly to the print function */}
                      <button type="button" onClick={() => handleDownloadPdf(order, index)}>
                        Download PDF
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7">No orders yet. Create and save a bill first.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}