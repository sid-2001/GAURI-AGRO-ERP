import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const orders = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(orders);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const partyName = String(body?.partyName || '').trim();
    const gstNumber = String(body?.gstNumber || '').trim();
    const date = String(body?.date || '').trim();
    const items = Array.isArray(body?.items) ? body.items : [];
    
    console.log("Incoming payload:", body);

    if (!partyName || !date || !items.length) {
      return NextResponse.json({ error: 'Invalid bill data.' }, { status: 400 });
    }

    const db = await getDb();

    // Fetch all products in one go
    const productIds = items.map((item) => new ObjectId(item.productId));
    const products = await db
      .collection('inventory')
      .find({ _id: { $in: productIds } })
      .toArray();

    const map = new Map(products.map((p) => [String(p._id), p]));

    const lineItems = [];
    
    // Process items and calculate discounts
    for (const item of items) {
      const qty = Number(item.qty || 0);
      const discountPercent = Number(item.discount || 0); // Extract discount
      const product = map.get(String(item.productId));
      
      if (!product || qty <= 0) {
        return NextResponse.json({ error: 'Invalid product or quantity in bill.' }, { status: 400 });
      }
      if (qty > product.stock) {
        return NextResponse.json({ error: `Insufficient stock for ${product.name}.` }, { status: 400 });
      }

      // Calculate discounted price
      const priceAfterDiscount = product.price * (1 - discountPercent / 100);
      const amount = qty * priceAfterDiscount;

      lineItems.push({
        productId: String(product._id),
        name: product.name,
        qty,
        price: product.price,
        discount: discountPercent,     // Save discount % to DB
        priceAfterDiscount,            // Save applied rate to DB
        amount                         // Save final line amount to DB
      });
    }

    // Math calculations mirroring frontend
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const gstAmount = subtotal * 0.05; // Changed to 5% to match frontend PDF
    const exactTotal = subtotal + gstAmount;
    const total = Math.round(exactTotal); // Rounding off to match frontend

    const order = {
      orderId: `ORD-${Date.now()}`,
      date,
      partyName,
      gstNumber,
      items: lineItems,
      subtotal,
      gstAmount,
      exactTotal, // Optional: keeping exact total for accounting precision
      total,
      createdAt: new Date()
    };

    // Save Order
    const result = await db.collection('orders').insertOne(order);

    // Update Inventory Stock
    const bulkOps = lineItems.map((item) => ({
      updateOne: {
        filter: { _id: new ObjectId(item.productId) },
        update: { $inc: { stock: -item.qty } }
      }
    }));

    if (bulkOps.length) {
      await db.collection('inventory').bulkWrite(bulkOps);
    }

    const created = await db.collection('orders').findOne({ _id: new ObjectId(result.insertedId) });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}