import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, Timestamp, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Note: initializeApp() is now handled in main.js to ensure it's called once before any usage

// Inicializar Firebase Auth
const auth = getAuth();
auth.useDeviceLanguage(); // Opcional: Usar el idioma del dispositivo

// Inicializar otros servicios de Firebase
const db = getFirestore();
const googleProvider = new GoogleAuthProvider();
const storage = getStorage();

// Exportar los servicios
export { auth, db, googleProvider, storage };

// Funciones para gestionar créditos
export const getUserCredits = async (userId) => {
  if (!userId) return { credits: 0 };
  
  try {
    const userCreditsRef = doc(db, "userCredits", userId);
    const userCreditsDoc = await getDoc(userCreditsRef);
    
    if (userCreditsDoc.exists()) {
      return userCreditsDoc.data();
    } else {
      // Si no existe, crear un documento de créditos para el usuario con créditos iniciales
      const initialCredits = { 
        credits: 50, // Créditos iniciales para nuevos usuarios
        transactions: [],
        lastUpdated: Timestamp.now()
      };
      await setDoc(userCreditsRef, initialCredits);
      return initialCredits;
    }
  } catch (error) {
    console.error("Error al obtener créditos:", error);
    return { credits: 0 };
  }
};

export const updateUserCredits = async (userId, amount, concept) => {
  if (!userId) return false;
  
  try {
    const userCreditsRef = doc(db, "userCredits", userId);
    const userCreditsDoc = await getDoc(userCreditsRef);
    
    let currentCredits = 0;
    let transactions = [];
    
    if (userCreditsDoc.exists()) {
      currentCredits = userCreditsDoc.data().credits || 0;
      transactions = userCreditsDoc.data().transactions || [];
    }
    
    // Nueva transacción
    const transaction = {
      id: Date.now().toString(),
      date: Timestamp.now(),
      amount,
      concept,
      balanceAfter: currentCredits + amount
    };
    
    // Actualizar créditos
    await setDoc(userCreditsRef, {
      credits: currentCredits + amount,
      transactions: [transaction, ...transactions],
      lastUpdated: Timestamp.now()
    });
    
    return true;
  } catch (error) {
    console.error("Error al actualizar créditos:", error);
    return false;
  }
};

export const deductCredits = async (userId, amount, concept) => {
  if (!userId) return false;
  
  try {
    const userCreditsRef = doc(db, "userCredits", userId);
    const userCreditsDoc = await getDoc(userCreditsRef);
    
    if (!userCreditsDoc.exists()) {
      return false;
    }
    
    const currentCredits = userCreditsDoc.data().credits || 0;
    
    // Verificar si hay suficientes créditos
    if (currentCredits < amount) {
      return false;
    }
    
    // Deducir créditos (cantidad negativa)
    return updateUserCredits(userId, -amount, concept);
  } catch (error) {
    console.error("Error al deducir créditos:", error);
    return false;
  }
};
