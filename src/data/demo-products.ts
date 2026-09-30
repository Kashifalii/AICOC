import demoStoreFixture from "./demo-store.json";
import { productSchema } from "@/lib/audit/types";

export const demoProducts = productSchema.array().parse(demoStoreFixture);
