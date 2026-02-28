'use client';

import { useEffect, useMemo, useState } from 'react';

const navItems = [
  { id: 'billing', label: 'Create Bill' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'dashboard', label: 'Sales Dashboard' },
  { id: 'orders', label: 'Orders History' }
];

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
    loadData();
  }, []);

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
    const gstAmount = subtotal * 0.18;
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
      setPartyName('');
      setGstNumber('');
      await loadData();
    } catch (saveError) {
      alert(saveError.message);
    }
  };

  const handleDownloadPdf = () => {
    if (!partyName.trim() || !billPreview.rows.length) {
      alert('Please fill party name and bill items before PDF export.');
      return;
    }

    const lines = billPreview.rows
      .map(
        (row) =>
          `<tr><td>${row.product.name}</td><td>${row.quantity}</td><td>${formatCurrency(row.product.price)}</td><td>${formatCurrency(
            row.amount
          )}</td></tr>`
      )
      .join('');

    const billHtml = `
      <html>
        <head>
          <title>Gauri Agro Bill</title>
          <style>
            body { font-family: Arial; padding: 18px; }
            .head { display:flex; gap:12px; align-items:center; background:#081008; color:#7dff5e; padding:10px; border-radius:8px; }
            img { width:52px; height:52px; border-radius:50%; }
            table { width:100%; border-collapse: collapse; margin-top:14px; }
            th, td { border:1px solid #222; padding:8px; text-align:left; }
            th { background:#111; color:#7dff5e; }
          </style>
        </head>
        <body>
          <div class="head">
            <img src="https://static.wixstatic.com/media/75f4d5_13bdb4f8642d459d842bae2db20aefad~mv2.jpg/v1/fill/w_77,h_77,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/WhatsApp%20Image%202025-06-08%20at%204_56_edited.jpg" />
            <div>
              <h2>GAURI AGRO</h2>
              <p>KHUSHALPUR ROAD, MORADABAD 244001 ,UTTAR PRADESH,India</p>
            </div>
          </div>
          <p><b>Bill Date:</b> ${billDate}</p>
          <p><b>Party:</b> ${partyName}</p>
          <p><b>GST:</b> ${gstNumber || 'N/A'}</p>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>${lines}</tbody>
          </table>
          <h3>Subtotal: ${formatCurrency(billPreview.subtotal)}</h3>
          <h3>GST (18%): ${formatCurrency(billPreview.gstAmount)}</h3>
          <h2>Grand Total: ${formatCurrency(billPreview.total)}</h2>
          <p>Use browser print and choose "Save as PDF".</p>
          <script>window.print()</script>
        </body>
      </html>`;

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
          <p>KHUSAL PUR ROAD, MORADABAD 244001, INDIA, UTTAR PRADESH</p>
        </div>
      </header>

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
              <button type="button" onClick={handleGenerateOrder}>
                Save Bill
              </button>
              <button type="button" onClick={handleDownloadPdf}>
                Download PDF
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
            <p>GST (18%): {formatCurrency(billPreview.gstAmount)}</p>
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
                <th>Order ID</th>
                <th>Date</th>
                <th>Party</th>
                <th>GST</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.length ? (
                orders.map((order) => (
                  <tr key={String(order._id)}>
                    <td>{order.orderId}</td>
                    <td>{order.date}</td>
                    <td>{order.partyName}</td>
                    <td>{order.gstNumber || 'N/A'}</td>
                    <td>{formatCurrency(order.total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">No orders yet. Create and save a bill first.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
