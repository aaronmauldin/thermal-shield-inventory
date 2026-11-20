import { randomUUID } from "crypto";
import type { AppData, InventoryItem, JobMaterial, JobRecord, Truck } from "./types";

export const DEMO_USAGE_NOTE = "[demo-usage]";

const STREETS = [
  "Oak St",
  "Maple Ave",
  "Pine Rd",
  "Cedar Ln",
  "Birch Dr",
  "Willow Way",
  "Hickory Ct",
  "Elm St",
  "Walnut Ave",
  "Spruce Hill",
];

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length) % list.length];
}

function itemNamed(items: InventoryItem[], name: string) {
  return items.find((item) => item.name === name) || null;
}

function line(item: InventoryItem | null, quantity: number): JobMaterial | null {
  if (!item || quantity <= 0) return null;
  return {
    itemId: item.id,
    itemName: item.name,
    quantity,
    unit: item.unit,
  };
}

export function isDemoUsageJob(job: JobRecord) {
  return (job.notes || "").includes(DEMO_USAGE_NOTE);
}

function atNoonEastern(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0).toISOString();
}

export function buildDemoUsageJobs(trucks: Truck[], items: InventoryItem[]): JobRecord[] {
  const batt = itemNamed(items, "R-38 Fiberglass Batts");
  const foam = itemNamed(items, "Open-cell Spray Foam");
  const caulk = itemNamed(items, "Clear Siliconized Acrylic");
  const thermo = itemNamed(items, "Wi-Fi Smart Thermostat");
  const fireblock = itemNamed(items, "Fireblock Foam Sealant");
  if (!batt || trucks.length === 0) return [];

  const rand = mulberry32(20261009);
  const jobs: JobRecord[] = [];
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const cursor = new Date(end);
  cursor.setDate(cursor.getDate() - 62);

  while (cursor < end) {
    const dow = cursor.getDay();
    if (dow === 0 || (dow === 6 && rand() < 0.7)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    if (rand() < 0.12) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const stamp = atNoonEastern(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate()
    );
    const jobsToday = rand() < 0.35 ? 1 : 2;

    for (let n = 0; n < jobsToday; n += 1) {
      const truck = trucks[Math.floor(rand() * trucks.length) % trucks.length];
      const house = 100 + Math.floor(rand() * 800);
      const street = pick(rand, STREETS);
      const materials: JobMaterial[] = [];

      if (rand() < 0.18) {
        jobs.push({
          id: randomUUID(),
          name: `Demo: ${house} ${street}`,
          location: `${house} ${street}`,
          notes: `${DEMO_USAGE_NOTE} empty Jobber job`,
          truckId: truck.id,
          truckName: truck.name,
          materials: [],
          bagCount: 0,
          bagEntries: [],
          amountCharged: 0,
          materialCost: 0,
          scheduledAt: stamp,
          createdAt: stamp,
          updatedAt: stamp,
        });
        continue;
      }

      const size = rand();
      const bags =
        size < 0.12
          ? 18 + Math.floor(rand() * 6)
          : size > 0.88
            ? 52 + Math.floor(rand() * 10)
            : 32 + Math.floor(rand() * 17);
      const battLine = line(batt, bags);
      if (battLine) materials.push(battLine);

      if (foam && rand() < 0.15) {
        const foamLine = line(foam, 1 + Math.floor(rand() * 2));
        if (foamLine) materials.push(foamLine);
      }
      if (caulk && rand() < 0.45) {
        const caulkLine = line(caulk, 2 + Math.floor(rand() * 5));
        if (caulkLine) materials.push(caulkLine);
      }
      if (thermo && rand() < 0.12) {
        const thermoLine = line(thermo, 1);
        if (thermoLine) materials.push(thermoLine);
      }
      if (fireblock && rand() < 0.1) {
        const fireLine = line(fireblock, 1);
        if (fireLine) materials.push(fireLine);
      }

      jobs.push({
        id: randomUUID(),
        name: `Demo: ${house} ${street}`,
        location: `${house} ${street}`,
        notes: DEMO_USAGE_NOTE,
        truckId: truck.id,
        truckName: truck.name,
        materials,
        bagCount: bags,
        bagEntries: [
          {
            id: randomUUID(),
            bags,
            employeeName: "Demo",
            itemId: batt.id,
            itemName: batt.name,
            createdAt: stamp,
          },
        ],
        amountCharged: 0,
        materialCost: 0,
        scheduledAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return jobs;
}

export function applyDemoUsageJobs(data: AppData) {
  const kept = (data.jobs || []).filter((job) => !isDemoUsageJob(job));
  const demo = buildDemoUsageJobs(data.trucks || [], data.items || []);
  data.jobs = [...demo, ...kept];
  return { added: demo.length, kept: kept.length };
}
