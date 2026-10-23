import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  const compDocRef = doc(db, 'hesabaty_accounting_sync', 'company_COMP-101');
  const snap = await getDoc(compDocRef);
  if (snap.exists()) {
    const data = snap.data();
    if (data.data) {
      const parsed = JSON.parse(data.data);
      console.log('COMP-101 branches:', JSON.stringify(parsed.branches, null, 2));
      console.log('COMP-101 users:', parsed.users.map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role, branchId: u.branchId, pin: u.password })));
    }
  } else {
    console.log('company_COMP-101 does not exist');
  }

  // Also check main doc
  const mainDocRef = doc(db, 'hesabaty_accounting_sync', 'hesabaty_primary_v6');
  const mainSnap = await getDoc(mainDocRef);
  if (mainSnap.exists()) {
    const data = mainSnap.data();
    if (data.data) {
      const parsed = JSON.parse(data.data);
      console.log('hesabaty_primary_v6 branches:', JSON.stringify(parsed.branches, null, 2));
    }
  }
}

inspect().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
