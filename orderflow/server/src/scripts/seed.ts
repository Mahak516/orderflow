/**
 * Creates demo data: one admin, one customer and a product catalogue.
 *
 *   npm run seed
 *
 * Local development uses obvious demo passwords. In production you must provide
 * SEED_ADMIN_PASSWORD, so a well-known password can never reach a real deployment.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../config';
import { Product } from '../models/product';
import { User } from '../models/user';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@orderflow.dev';
const DEMO_PASSWORD = 'Password123!';

// Prices are in paise (1/100 of a rupee).
const PRODUCTS = [
  { name: 'Mechanical Keyboard', category: 'Accessories', priceCents: 349900, stock: 25, description: 'Hot-swappable 75% keyboard with tactile switches.' },
  { name: 'Wireless Mouse', category: 'Accessories', priceCents: 129900, stock: 60, description: 'Ergonomic mouse, 2.4 GHz and Bluetooth.' },
  { name: 'USB-C Hub 7-in-1', category: 'Accessories', priceCents: 249900, stock: 40, description: 'HDMI, SD card, USB 3.0 and 100 W pass-through charging.' },
  { name: '27" 4K Monitor', category: 'Displays', priceCents: 2299900, stock: 8, description: 'IPS panel, 99% sRGB, USB-C input.' },
  { name: '24" Full HD Monitor', category: 'Displays', priceCents: 949900, stock: 15, description: '75 Hz IPS monitor with slim bezels.' },
  { name: 'Laptop Stand', category: 'Accessories', priceCents: 119900, stock: 3, description: 'Adjustable aluminium stand.' },
  { name: 'Noise-Cancelling Headphones', category: 'Audio', priceCents: 1499900, stock: 20, description: '30-hour battery with active noise cancellation.' },
  { name: 'Bluetooth Speaker', category: 'Audio', priceCents: 399900, stock: 35, description: 'Water-resistant portable speaker.' },
  { name: '1080p Webcam', category: 'Video', priceCents: 299900, stock: 2, description: 'Autofocus webcam with a privacy shutter.' },
  { name: 'Portable SSD 1TB', category: 'Storage', priceCents: 749900, stock: 30, description: 'Up to 1,050 MB/s read speed.' },
  { name: 'Smart LED Desk Lamp', category: 'Home Office', priceCents: 179900, stock: 45, description: 'Adjustable colour temperature and brightness.' },
  { name: 'Ergonomic Office Chair', category: 'Home Office', priceCents: 1299900, stock: 5, description: 'Mesh back with lumbar support.' },
];

async function main(): Promise<void> {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? (config.isProd ? undefined : DEMO_PASSWORD);
  if (!adminPassword) {
    throw new Error('Set SEED_ADMIN_PASSWORD to seed a production database');
  }

  await mongoose.connect(config.mongoUri);

  if (!(await User.exists({ email: ADMIN_EMAIL }))) {
    await User.create({
      name: 'Admin',
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'admin',
    });
    console.log(`Created admin ${ADMIN_EMAIL}`);
  }

  if (!config.isProd && !(await User.exists({ email: 'customer@orderflow.dev' }))) {
    await User.create({
      name: 'Demo Customer',
      email: 'customer@orderflow.dev',
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      role: 'customer',
    });
    console.log('Created demo customer customer@orderflow.dev');
  }

  if ((await Product.countDocuments()) === 0) {
    await Product.insertMany(PRODUCTS);
    console.log(`Created ${PRODUCTS.length} products`);
  }

  if (!config.isProd) console.log(`Demo logins use the password: ${DEMO_PASSWORD}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
