import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../lib/mongodb';

const defaultInventory = [
  { name: 'Neem Fertilizer', price: 450, stock: 40 },
  { name: 'Organic Pesticide', price: 620, stock: 28 },
  { name: 'Soil Booster Mix', price: 390, stock: 65 }
];

async function ensureSeed(db) {
  const count = await db.collection('inventory').countDocuments();
  if (!count) {
    await db.collection('inventory').insertMany(defaultInventory);
  }
}

export async function GET() {
  try {
    const db = await getDb();
    await ensureSeed(db);
    const products = await db.collection('inventory').find({}).sort({ name: 1 }).toArray();
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || '').trim();
    const price = Number(body?.price || 0);
    const stock = Number(body?.stock || 0);

    if (!name || price <= 0 || stock < 0) {
      return NextResponse.json({ error: 'Invalid product payload.' }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection('inventory').insertOne({ name, price, stock });
    const created = await db.collection('inventory').findOne({ _id: new ObjectId(result.insertedId) });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
