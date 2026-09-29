import { NextResponse } from "next/server";
import products from "@/data/demo-store.json";
import { z } from "zod";

const requestSchema = z.object({});
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid seed request" } },
      { status: 400 },
    );
  return NextResponse.json({
    store: {
      id: "demo-store",
      name: "Northstar Goods",
      type: "demo",
      productCount: products.length,
    },
    products,
  });
}
