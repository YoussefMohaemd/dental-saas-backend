const clinic = (index: number) => ({
  id: `clinic-${index}`,
  name: `Dental Care Clinic ${index}`,
  address: `${index} Health Street`,
  city: ['Cairo', 'Giza', 'Alexandria', 'Mansoura', 'Tanta'][index - 1],
  phone: `+20 10 5555 00${index}`,
  email: `clinic${index}@example.test`,
  status: 'Active' as const,
  accountManager: `Account Manager ${index}`,
});

const doctor = (index: number) => ({
  id: `doctor-${index}`,
  lookupId: `DR-${String(index).padStart(3, '0')}`,
  name: [
    'Amira Hassan',
    'Omar Khalil',
    'Mariam Adel',
    'Youssef Nabil',
    'Nour Samir',
  ][index - 1],
  specialty: ['Prosthodontics', 'Orthodontics', 'Implantology', 'Endodontics', 'Cosmetic Dentistry'][index - 1],
  clinicId: `clinic-${index}`,
  email: `doctor${index}@example.test`,
  phone: `+20 11 4444 00${index}`,
  status: 'Active' as const,
  joinedDate: `202${index}-01-15`,
  avatar: '',
});

const patient = (index: number) => {
  const doctorIndex = ((index - 1) % 5) + 1;
  const patientNames = [
    'Ahmed Hassan', 'Mona Ibrahim', 'Omar Nabil', 'Laila Samir', 'Yassin Adel',
    'Nour Khaled', 'Hana Mostafa', 'Karim Tarek', 'Salma Hany', 'Adam Wael',
    'Dina Ashraf', 'Mahmoud Fathy', 'Farah Youssef', 'Tamer Ali', 'Mariam Hossam',
    'Salah Gamal', 'Reem Sherif', 'Khaled Magdy', 'Jana Sameh', 'Hossam Emad',
    'Aya Mohamed', 'Rami Saeed', 'Nada Fawzy', 'Ibrahim Ehab', 'Sahar Atef',
    'Ziad Amr', 'Heba Essam', 'Mostafa Ayman', 'Rana Wael', 'Youssef Hany',
    'Mai Tarek', 'Amr Hisham', 'Esraa Adel', 'Fady Nasser', 'Nadine Samir',
  ];
  return {
    id: `patient-${index}`,
    name: patientNames[index - 1],
    dob: `19${80 + (index % 20)}-${String((index % 9) + 1).padStart(2, '0')}-10`,
    gender: index % 2 === 0 ? 'F' as const : 'M' as const,
    phone: `+20 12 3333 ${String(index).padStart(4, '0')}`,
    email: `patient${index}@example.test`,
    clinicId: `clinic-${doctorIndex}`,
    doctorId: `doctor-${doctorIndex}`,
    status: 'Active' as const,
    lastVisit: `2026-${String((index % 9) + 1).padStart(2, '0')}-05`,
  };
};

const restorationTypes = ['Crown', 'Bridge', 'Veneer', 'Implant Crown', 'Full Arch'] as const;
const statuses = ['New', 'Review', 'Design', 'Production', 'Quality Check', 'Ready', 'Completed'] as const;
const priorities = ['Low', 'Normal', 'High', 'Urgent'] as const;

const order = (index: number) => {
  const doctorIndex = ((index - 1) % 5) + 1;
  const status = statuses[(index - 1) % statuses.length];
  const amount = 350 + index * 45;
  return {
    id: `order-${index}`,
    orderNumber: `DL-${String(26000 + index).padStart(6, '0')}`,
    patientId: `patient-${index}`,
    doctorId: `doctor-${doctorIndex}`,
    clinicId: `clinic-${doctorIndex}`,
    scanCenterId: `scan-center-${((index - 1) % 3) + 1}`,
    status,
    priority: priorities[(index - 1) % priorities.length],
    restoration: restorationTypes[(index - 1) % restorationTypes.length],
    arch: index % 3 === 0 ? 'Both' : index % 2 === 0 ? 'Mandible' : 'Maxilla',
    format: index % 2 === 0 ? 'STL' : 'PLY',
    shade: ['A1', 'A2', 'A3', 'B1'][index % 4],
    units: (index % 4) + 1,
    amount,
    billed: index % 3 === 0,
    billTo: `clinic-${doctorIndex}`,
    vouchers: index % 3,
    isLocked: status === 'Completed',
    hasNotes: index % 2 === 0,
    notes: index % 2 === 0 ? `Clinical notes for order ${index}` : '',
    receivedAt: `2026-${String((index % 9) + 1).padStart(2, '0')}-01`,
    sentAt: index > 2 ? `2026-${String((index % 9) + 1).padStart(2, '0')}-02` : null,
    chargedAt: index % 3 === 0 ? `2026-${String((index % 9) + 1).padStart(2, '0')}-03` : null,
    dueDate: `2026-${String(((index + 2) % 9) + 1).padStart(2, '0')}-20`,
    csTask: index % 4 === 0 ? `CS-${String(index).padStart(4, '0')}` : null,
    technicianName: ['Karim Fathy', 'Salma Adel', 'Hassan Mahmoud', 'Mina George', 'Rania Mostafa'][(index - 1) % 5],
  };
};

const subOrder = (index: number) => ({
  id: `sub-order-${index}`,
  orderId: `order-${index}`,
  service: ['Crown Design', 'Digital Wax-up', 'Milling', 'Quality Control'][index % 4],
  icon: ['🦷', '✨', '⚙️', '📋'][index % 4],
  status: index % 4 === 0 ? 'done' as const : index % 3 === 0 ? 'in-progress' as const : 'pending' as const,
  formsComplete: index % 4,
  formsTotal: 4,
  scansComplete: index % 3,
  scansTotal: 3,
  teeth: [11 + (index % 8), 21 + (index % 8)],
  priority: priorities[(index - 1) % priorities.length],
  dueDate: `2026-${String(((index + 2) % 9) + 1).padStart(2, '0')}-20`,
  notes: `Service notes for order ${index}`,
});

const dentalCase = (index: number) => {
  const doctorIndex = ((index - 1) % 5) + 1;
  return {
    id: `case-${index}`,
    caseNumber: `CASE-${String(4000 + index)}`,
    title: `Treatment plan ${index}`,
    patientId: `patient-${index}`,
    doctorId: `doctor-${doctorIndex}`,
    clinicId: `clinic-${doctorIndex}`,
    status: ['Open', 'In Progress', 'Review', 'Closed'][index % 4],
    priority: priorities[(index - 1) % priorities.length],
    ordersCount: 1 + (index % 3),
    filesCount: 2 + (index % 5),
    createdAt: `2026-${String((index % 9) + 1).padStart(2, '0')}-01`,
    updatedAt: `2026-${String((index % 9) + 1).padStart(2, '0')}-10`,
    notes: `Case notes for patient ${index}`,
  };
};

export const generatedSeedData: Record<string, unknown> = {
  'clinics.json': Array.from({ length: 5 }, (_, index) => clinic(index + 1)),
  'doctors.json': Array.from({ length: 5 }, (_, index) => doctor(index + 1)),
  'patients.json': Array.from({ length: 35 }, (_, index) => patient(index + 1)),
  'orders.json': Array.from({ length: 35 }, (_, index) => order(index + 1)),
  'sub-orders.json': Array.from({ length: 35 }, (_, index) => subOrder(index + 1)),
  'cases.json': Array.from({ length: 25 }, (_, index) => dentalCase(index + 1)),
  'billing.json': Array.from({ length: 35 }, (_, index) => ({
    id: `billing-${index + 1}`,
    orderId: `order-${index + 1}`,
    amount: 350 + (index + 1) * 45,
    status: index % 3 === 0 ? 'Paid' : index % 3 === 1 ? 'Invoiced' : 'Pending',
    invoiceNumber: `INV-${String(7000 + index + 1)}`,
    invoiceDate: `2026-${String(((index + 1) % 9) + 1).padStart(2, '0')}-04`,
    dueDate: `2026-${String(((index + 3) % 9) + 1).padStart(2, '0')}-20`,
    paidDate: index % 3 === 0 ? `2026-${String(((index + 1) % 9) + 1).padStart(2, '0')}-08` : null,
    vouchers: (index + 1) % 3,
    notes: '',
  })),
  'change-requests.json': Array.from({ length: 10 }, (_, index) => ({
    id: `change-request-${index + 1}`,
    requestNumber: `CR-${String(5000 + index + 1)}`,
    orderId: `order-${index + 1}`,
    requester: doctor(index % 5 + 1).name,
    status: ['Pending', 'In Review', 'Approved', 'Completed'][index % 4],
    priority: priorities[index % priorities.length],
    description: `Change request ${index + 1}`,
    createdAt: `2026-${String((index % 9) + 1).padStart(2, '0')}-06`,
    updatedAt: `2026-${String((index % 9) + 1).padStart(2, '0')}-07`,
  })),
  'documents.json': Array.from({ length: 20 }, (_, index) => ({
    id: `document-${index + 1}`,
    name: `Patient document ${index + 1}.pdf`,
    category: ['Prescriptions', 'Scan Files', 'Patient Photos', 'Invoices', 'Reports'][index % 5],
    type: 'PDF',
    size: `${1 + (index % 8)} MB`,
    date: `2026-${String((index % 9) + 1).padStart(2, '0')}-05`,
    doctor: doctor(index % 5 + 1).name,
  })),
  'notifications.json': Array.from({ length: 25 }, (_, index) => ({
    id: `notification-${index + 1}`,
    type: ['order', 'workflow', 'file', 'billing', 'system'][index % 5],
    title: `Notification ${index + 1}`,
    message: `There is an update for order ${((index) % 35) + 1}.`,
    read: index % 3 === 0,
    createdAt: `2026-${String((index % 9) + 1).padStart(2, '0')}-08`,
    relatedId: `order-${((index) % 35) + 1}`,
    relatedType: 'order',
  })),
  'scan-centers.json': [1, 2, 3].map((index) => ({ id: `scan-center-${index}` })),
};
