import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAyGnnrYRgTWO54esnpW1lsnqsOv8PvOKs",
  authDomain: "leadflow-crm-5b05c.firebaseapp.com",
  projectId: "leadflow-crm-5b05c",
  storageBucket: "leadflow-crm-5b05c.firebasestorage.app",
  messagingSenderId: "423806921515",
  appId: "1:423806921515:web:default"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const clearDatabase = async () => {
  const collections = ['leads', 'interactions', 'auditLogs', 'uploadBatches'];
  
  for (const collName of collections) {
    console.log(`Clearing ${collName}...`);
    const q = collection(db, collName);
    const snap = await getDocs(q);
    
    let count = 0;
    for (const docSnap of snap.docs) {
      await deleteDoc(doc(db, collName, docSnap.id));
      count++;
    }
    console.log(`Deleted ${count} documents from ${collName}.`);
  }
  
  console.log(`Cleaning users...`);
  const usersSnap = await getDocs(collection(db, 'users'));
  let userCount = 0;
  for (const docSnap of usersSnap.docs) {
    const data = docSnap.data();
    if (data.role !== 'admin') {
      await deleteDoc(doc(db, 'users', docSnap.id));
      userCount++;
    } else {
      console.log(`Skipped admin user: ${data.name || docSnap.id} / ${data.email}`);
    }
  }
  console.log(`Deleted ${userCount} non-admin users.`);
  console.log('Database cleared successfully!');
  process.exit(0);
};

clearDatabase().catch(err => {
    console.error(err);
    process.exit(1);
});
