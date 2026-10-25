const seedReferenceDate = new Date();
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const CLINIC_COUNT = 10;
const DOCTOR_COUNT = 10;
const PATIENT_COUNT = 65;

const dateDaysAgo = (days: number): string =>
  new Date(seedReferenceDate.getTime() - Math.max(days, 0) * millisecondsPerDay).toISOString();

const dateOnlyDaysAgo = (days: number): string => dateDaysAgo(days).slice(0, 10);

const dateOnlyDaysFromNow = (days: number): string =>
  new Date(seedReferenceDate.getTime() + Math.max(days, 0) * millisecondsPerDay)
    .toISOString()
    .slice(0, 10);

const patientGenderByName: Record<string, 'M' | 'F'> = {
  'Ahmed Hassan': 'M',
  'Mona Ibrahim': 'F',
  'Omar Nabil': 'M',
  'Laila Samir': 'F',
  'Yassin Adel': 'M',
  'Nour Khaled': 'F',
  'Hana Mostafa': 'F',
  'Karim Tarek': 'M',
  'Salma Hany': 'F',
  'Adam Wael': 'M',
  'Dina Ashraf': 'F',
  'Mahmoud Fathy': 'M',
  'Farah Youssef': 'F',
  'Tamer Ali': 'M',
  'Mariam Hossam': 'F',
  'Salah Gamal': 'M',
  'Reem Sherif': 'F',
  'Khaled Magdy': 'M',
  'Jana Sameh': 'F',
  'Hossam Emad': 'M',
  'Aya Mohamed': 'F',
  'Rami Saeed': 'M',
  'Nada Fawzy': 'F',
  'Ibrahim Ehab': 'M',
  'Sahar Atef': 'F',
  'Ziad Amr': 'M',
  'Heba Essam': 'F',
  'Mostafa Ayman': 'M',
  'Rana Wael': 'F',
  'Youssef Hany': 'M',
  'Mai Tarek': 'F',
  'Amr Hisham': 'M',
  'Esraa Adel': 'F',
  'Fady Nasser': 'M',
  'Nadine Samir': 'F',
  'Hassan Ibrahim': 'M',
  'Sara Mostafa': 'F',
  'Kareem Adel': 'M',
  'Mariam Tarek': 'F',
  'Walid Hany': 'M',
  'Huda Nabil': 'F',
  'Tarek Fathy': 'M',
  'Nourhan Samir': 'F',
  'Ayman Khalil': 'M',
  'Salma Adel': 'F',
  'Othman Youssef': 'M',
  'Rania Fathy': 'F',
  'Maged Hassan': 'M',
  'Dalia Emad': 'F',
  'Khaled Nabil': 'M',
  'Heba Mostafa': 'F',
  'Sami Ibrahim': 'M',
  'Lamia Tarek': 'F',
  'Waleed Omar': 'M',
  'Nadia Hassan': 'F',
  'Sherif Adel': 'M',
  'Maya Khaled': 'F',
  'Hany Fathy': 'M',
  'Amina Youssef': 'F',
  'Basel Nabil': 'M',
  'Hala Samir': 'F',
  'Ehab Mostafa': 'M',
  'Salwa Hassan': 'F',
  'Marwan Tarek': 'M',
  'Riham Adel': 'F',
};

const clinic = (index: number) => ({
  id: `clinic-${index}`,
  name: `Dental Care Clinic ${index}`,
  address: `${index} Health Street`,
  city: [
    'Cairo',
    'Giza',
    'Alexandria',
    'Mansoura',
    'Tanta',
    'Aswan',
    'Ismailia',
    'Suez',
    'Fayoum',
    'Zagazig',
  ][index - 1],
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
    'Karim Fathy',
    'Dina Khaled',
    'Hassan Adel',
    'Rana Nabil',
    'Mostafa Samir',
  ][index - 1],
  gender: [1, 3, 5, 7, 9].includes(index) ? 'F' : 'M',
  specialty: [
    'Prosthodontics',
    'Orthodontics',
    'Implantology',
    'Endodontics',
    'Cosmetic Dentistry',
    'Periodontics',
    'Pediatric Dentistry',
    'Oral Surgery',
    'Restorative Dentistry',
    'Digital Dentistry',
  ][index - 1],
  clinicId: `clinic-${index}`,
  email: `doctor${index}@example.test`,
  phone: `+20 11 4444 00${index}`,
  status: 'Active' as const,
  joinedDate: dateOnlyDaysAgo(365 + index * 120),
  avatar: '',
});

const patient = (index: number) => {
  const doctorIndex = ((index - 1) % DOCTOR_COUNT) + 1;
  const patientNames = [
    'Ahmed Hassan',
    'Mona Ibrahim',
    'Omar Nabil',
    'Laila Samir',
    'Yassin Adel',
    'Nour Khaled',
    'Hana Mostafa',
    'Karim Tarek',
    'Salma Hany',
    'Adam Wael',
    'Dina Ashraf',
    'Mahmoud Fathy',
    'Farah Youssef',
    'Tamer Ali',
    'Mariam Hossam',
    'Salah Gamal',
    'Reem Sherif',
    'Khaled Magdy',
    'Jana Sameh',
    'Hossam Emad',
    'Aya Mohamed',
    'Rami Saeed',
    'Nada Fawzy',
    'Ibrahim Ehab',
    'Sahar Atef',
    'Ziad Amr',
    'Heba Essam',
    'Mostafa Ayman',
    'Rana Wael',
    'Youssef Hany',
    'Mai Tarek',
    'Amr Hisham',
    'Esraa Adel',
    'Fady Nasser',
    'Nadine Samir',
    'Hassan Ibrahim',
    'Sara Mostafa',
    'Kareem Adel',
    'Mariam Tarek',
    'Walid Hany',
    'Huda Nabil',
    'Tarek Fathy',
    'Nourhan Samir',
    'Ayman Khalil',
    'Salma Adel',
    'Othman Youssef',
    'Rania Fathy',
    'Maged Hassan',
    'Dalia Emad',
    'Khaled Nabil',
    'Heba Mostafa',
    'Sami Ibrahim',
    'Lamia Tarek',
    'Waleed Omar',
    'Nadia Hassan',
    'Sherif Adel',
    'Maya Khaled',
    'Hany Fathy',
    'Amina Youssef',
    'Basel Nabil',
    'Hala Samir',
    'Ehab Mostafa',
    'Salwa Hassan',
    'Marwan Tarek',
    'Riham Adel',
  ];
  const name = patientNames[index - 1] ?? `Patient ${index}`;
  return {
    id: `patient-${index}`,
    name,
    dob: `19${80 + (index % 20)}-${String((index % 9) + 1).padStart(2, '0')}-10`,
    gender: patientGenderByName[name] ?? 'M',
    phone: `+20 12 3333 ${String(index).padStart(4, '0')}`,
    email: `patient${index}@example.test`,
    clinicId: `clinic-${doctorIndex}`,
    doctorId: `doctor-${doctorIndex}`,
    status: 'Active' as const,
    lastVisit: dateOnlyDaysAgo((index * 3) % 90),
  };
};

const restorationTypes = ['Crown', 'Bridge', 'Veneer', 'Implant Crown', 'Full Arch'] as const;
const statuses = [
  'New',
  'Review',
  'Design',
  'Production',
  'Quality Check',
  'Ready',
  'Completed',
] as const;
const priorities = ['Low', 'Normal', 'High', 'Urgent'] as const;

const order = (index: number) => {
  const doctorIndex = ((index - 1) % DOCTOR_COUNT) + 1;
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
    receivedAt: dateDaysAgo(((index * 3) % 45) + 1),
    sentAt: index > 2 ? dateDaysAgo((index * 3) % 45) : null,
    chargedAt: index % 3 === 0 ? dateDaysAgo(Math.max(((index * 3) % 45) - 1, 0)) : null,
    dueDate: dateOnlyDaysFromNow(7 + (index % 14)),
    csTask: index % 4 === 0 ? `CS-${String(index).padStart(4, '0')}` : null,
    technicianName: ['Karim Fathy', 'Salma Adel', 'Hassan Mahmoud', 'Mina George', 'Rania Mostafa'][
      (index - 1) % 5
    ],
  };
};

const subOrderServices = [
  {
    service: 'Crown Design',
    serviceId: 'final-restoration',
    icon: '✨',
    scanRequirements: ['Prep scan', 'Antagonist scan', 'Shade reference photo'],
    formKeys: ['clinicalNotes', 'material', 'specialInstructions'],
  },
  {
    service: 'Digital Wax-up',
    serviceId: 'treatment-plan',
    icon: '📋',
    scanRequirements: ['Full arch STL', 'Bite registration'],
    formKeys: ['clinicalNotes', 'marginType', 'specialInstructions'],
  },
  {
    service: 'Milling',
    serviceId: 'fmb',
    icon: '⚙️',
    scanRequirements: ['Upper arch STL', 'Lower arch STL'],
    formKeys: ['clinicalNotes', 'material', 'specialInstructions'],
  },
  {
    service: 'Quality Control',
    serviceId: 'other',
    icon: '📋',
    scanRequirements: ['As specified'],
    formKeys: ['clinicalNotes', 'specialInstructions'],
  },
] as const;

const subOrder = (index: number) => {
  const service = subOrderServices[(index - 1) % subOrderServices.length]!;
  const formsComplete = index % (service.formKeys.length + 1);
  const scansComplete = index % (service.scanRequirements.length + 1);

  return {
    id: `sub-order-${index}`,
    orderId: `order-${index}`,
    service: service.service,
    icon: service.icon,
    status:
      formsComplete === service.formKeys.length && scansComplete === service.scanRequirements.length
        ? ('done' as const)
        : formsComplete > 0 || scansComplete > 0
          ? ('in-progress' as const)
          : ('pending' as const),
    formsComplete,
    formsTotal: service.formKeys.length,
    scansComplete,
    scansTotal: service.scanRequirements.length,
    teeth: [11 + (index % 8), 21 + (index % 8)],
    priority: priorities[(index - 1) % priorities.length],
    dueDate: dateOnlyDaysFromNow(7 + (index % 14)),
    notes: `Service notes for order ${index}`,
    creationData: {
      serviceId: service.serviceId,
      serviceDetails: {
        shade: ['A1', 'A2', 'A3', 'B1'][index % 4],
        arch: index % 2 === 0 ? 'Mandible' : 'Maxilla',
      },
      serviceForm: Object.fromEntries(
        service.formKeys.map((key) => [key, `Seeded ${key} for ${service.service}`]),
      ),
      selectedTeeth: [11 + (index % 8), 21 + (index % 8)],
      scanRequirements: [...service.scanRequirements],
      fileReferences: [],
    },
  };
};

const dentalCase = (index: number) => {
  const doctorIndex = ((index - 1) % DOCTOR_COUNT) + 1;
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
    createdAt: dateDaysAgo(120 + index),
    updatedAt: dateDaysAgo(30 + index),
    notes: `Case notes for patient ${index}`,
  };
};

export const generatedSeedData: Record<string, unknown> = {
  'clinics.json': Array.from({ length: CLINIC_COUNT }, (_, index) => clinic(index + 1)),
  'doctors.json': Array.from({ length: DOCTOR_COUNT }, (_, index) => doctor(index + 1)),
  'patients.json': Array.from({ length: PATIENT_COUNT }, (_, index) => patient(index + 1)),
  'orders.json': Array.from({ length: PATIENT_COUNT }, (_, index) => order(index + 1)),
  'sub-orders.json': Array.from({ length: PATIENT_COUNT }, (_, index) => subOrder(index + 1)),
  'cases.json': Array.from({ length: 25 }, (_, index) => dentalCase(index + 1)),
  'billing.json': Array.from({ length: PATIENT_COUNT }, (_, index) => ({
    id: `billing-${index + 1}`,
    orderId: `order-${index + 1}`,
    amount: 350 + (index + 1) * 45,
    status: index % 3 === 0 ? 'Paid' : index % 3 === 1 ? 'Invoiced' : 'Pending',
    invoiceNumber: `INV-${String(7000 + index + 1)}`,
    invoiceDate: dateOnlyDaysAgo(40 + index),
    dueDate: dateOnlyDaysFromNow(7 + (index % 14)),
    paidDate: index % 3 === 0 ? dateOnlyDaysAgo(20 + index) : null,
    vouchers: (index + 1) % 3,
    notes: '',
  })),
  'change-requests.json': Array.from({ length: 10 }, (_, index) => ({
    id: `change-request-${index + 1}`,
    requestNumber: `CR-${String(5000 + index + 1)}`,
    orderId: `order-${index + 1}`,
    requester: doctor((index % 5) + 1).name,
    status: ['Pending', 'In Review', 'Approved', 'Completed'][index % 4],
    priority: priorities[index % priorities.length],
    description: `Change request ${index + 1}`,
    createdAt: dateDaysAgo(15 + index),
    updatedAt: dateDaysAgo(7 + index),
  })),
  'documents.json': Array.from({ length: 20 }, (_, index) => ({
    id: `document-${index + 1}`,
    name: `Patient document ${index + 1}.pdf`,
    category: ['Prescriptions', 'Scan Files', 'Patient Photos', 'Invoices', 'Reports'][index % 5],
    type: 'PDF',
    size: `${1 + (index % 8)} MB`,
    date: dateOnlyDaysAgo(60 + index),
    doctor: doctor((index % 5) + 1).name,
  })),
  'notifications.json': Array.from({ length: 25 }, (_, index) => ({
    id: `notification-${index + 1}`,
    type: ['order', 'workflow', 'file', 'billing', 'system'][index % 5],
    title: `Notification ${index + 1}`,
    message: `There is an update for order ${(index % PATIENT_COUNT) + 1}.`,
    read: index % 3 === 0,
    createdAt: dateDaysAgo(index + 1),
    relatedId: `order-${(index % PATIENT_COUNT) + 1}`,
    relatedType: 'order',
  })),
  'scan-centers.json': [1, 2, 3].map((index) => ({ id: `scan-center-${index}` })),
};
