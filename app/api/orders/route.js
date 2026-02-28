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

    if (!partyName || !date || !items.length) {
      return NextResponse.json({ error: 'Invalid bill data.' }, { status: 400 });
    }

    const db = await getDb();

    const productIds = items.map((item) => new ObjectId(item.productId));
    const products = await db
      .collection('inventory')
      .find({ _id: { $in: productIds } })
      .toArray();

    const map = new Map(products.map((p) => [String(p._id), p]));

    const lineItems = [];
    for (const item of items) {
      const qty = Number(item.qty || 0);
      const product = map.get(String(item.productId));
      if (!product || qty <= 0) {
        return NextResponse.json({ error: 'Invalid product or quantity in bill.' }, { status: 400 });
      }
      if (qty > product.stock) {
        return NextResponse.json({ error: `Insufficient stock for ${product.name}.` }, { status: 400 });
      }

      lineItems.push({
        productId: String(product._id),
        name: product.name,
        qty,
        price: product.price,
        amount: qty * product.price
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const gstAmount = subtotal * 0.18;
    const total = subtotal + gstAmount;

    const order = {
      orderId: `ORD-${Date.now()}`,
      date,
      partyName,
      gstNumber,
      items: lineItems,
      subtotal,
      gstAmount,
      total,
      createdAt: new Date()
    };

    const result = await db.collection('orders').insertOne(order);

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
