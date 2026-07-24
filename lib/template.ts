export const BLANK_TEMPLATE = Object.freeze({
  id: "pgflow-blank",
  version: "1.0.0",
  businessData: false,
  roles: ["platform_operator", "owner", "manager", "accountant", "tenant"],
  languages: ["en-IN", "hi-IN"],
  paymentMethods: ["upi", "cash"],
  invoiceStates: ["draft", "issued", "partially_paid", "paid", "overdue", "void"],
  paymentStates: ["pending_review", "approved", "rejected", "reversed", "refunded"],
  brandingSlots: ["name", "short_name", "logo", "primary", "accent", "app_icon", "receipt_identity"],
  defaultQuietHours: { start: "20:00", end: "09:00", timezone: "Asia/Kolkata" },
  demoRecords: 0,
} as const);

const names = [
  "Mira Kapoor", "Kavya Mehta", "Sana Iyer", "Ananya Rao", "Diya Sharma", "Ishita Nair", "Riya Das", "Aditi Jain",
  "Tara Menon", "Nisha Verma", "Meera Joshi", "Pooja Bhat", "Kriti Sinha", "Neha Pillai", "Avni Shah", "Ira Kulkarni",
  "Siya Reddy", "Tanvi Bose", "Aisha Khan", "Rhea Gupta", "Jiya Malhotra", "Vani Arora", "Nitya Roy", "Kiara Sen",
  "Aarohi Patil", "Myra Anand", "Prisha Dutta", "Samira Ali", "Navya Rao", "Esha Soni", "Ritu Bansal", "Mahi Desai",
  "Trisha Paul", "Suhani Kaur", "Rashi Shetty", "Lavanya Gill", "Bhavya Naik", "Charvi Goel", "Ishani Das", "Aarna Vyas",
  "Riddhi Shah", "Shreya Nair", "Kashvi Jain", "Naina Bose", "Mahika Roy", "Anvi Sinha", "Ruhi Verma", "Tanya Rao",
];

export function createCanonicalDemoSeed() {
  const floorCodes = ["G", "A", "B"];
  const floors = floorCodes.map((code, floorIndex) => ({ id: `floor_demo_${code.toLowerCase()}`, name: floorIndex === 0 ? "Ground" : floorIndex === 1 ? "First" : "Second", sortOrder: floorIndex }));
  const rooms = floors.flatMap((floor, floorIndex) => Array.from({ length: 8 }, (_, roomIndex) => ({
    id: `room_demo_${floorCodes[floorIndex].toLowerCase()}_${roomIndex + 1}`,
    floorId: floor.id,
    code: `${floorCodes[floorIndex]}-${floorIndex + 1}${String(roomIndex + 1).padStart(2, "0")}`,
    capacity: roomIndex < 4 ? 2 : 3,
    monthlyRent: 7600 + floorIndex * 500 + roomIndex * 100,
  })));
  const beds = rooms.flatMap((room) => Array.from({ length: room.capacity }, (_, bedIndex) => ({ id: `bed_demo_${room.id}_${bedIndex + 1}`, roomId: room.id, label: `Bed ${bedIndex + 1}` })));
  const tenants = names.map((name, index) => ({
    id: `tenant_demo_${String(index + 1).padStart(3, "0")}`,
    name,
    phone: `+91000000${String(index + 1).padStart(4, "0")}`,
    bedId: beds[index].id,
    moveInDate: `2026-${String((index % 6) + 1).padStart(2, "0")}-${String((index % 20) + 1).padStart(2, "0")}`,
    paymentState: (["paid", "paid", "paid", "partially_paid", "overdue", "pending_review"] as const)[index % 6],
  }));
  return {
    seedVersion: "1.0.0",
    organization: { id: "org_sample_pgflow", name: "PGFlow Sample", demoMode: true, fictional: true },
    floors,
    rooms,
    beds,
    tenants,
    integrations: { whatsapp: "disabled", upi: "non-payment-marker" },
  } as const;
}
