<script setup>
import { ref, onMounted, computed } from "vue";
import { auth, getUserCredits, updateUserCredits } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import PayPalButton from "@/components/payments/PayPalButton.vue";

// Estado reactivo
const userCredits = ref(0);
const transactions = ref([]);
const isLoading = ref(true);
const purchaseDialog = ref(false);
const paymentDialog = ref(false);
const successDialog = ref(false);
const selectedPackage = ref(null);
const paymentMethod = ref("paypal");
const error = ref("");
const processingPayment = ref(false);

// Datos para el dashboard
const categoryColors = [
  '#ffc107', // amber
  '#FF5722', // deep-orange
  '#2196F3', // blue
  '#4CAF50', // green
  '#9C27B0', // purple
];

const categoryIcons = [
  'mdi-note-plus',
  'mdi-map-marker',
  'mdi-image',
  'mdi-text-long',
  'mdi-shopping',
];

// Categorías de gastos para el dashboard
const spendingCategories = computed(() => {
  // Inicializar categorías
  const categories = [
    { name: 'Posts básicos', spent: 0 },
    { name: 'Ubicaciones', spent: 0 },
    { name: 'Imágenes', spent: 0 },
    { name: 'Textos largos', spent: 0 },
    { name: 'Otros', spent: 0 }
  ];
  
  // Calcular gastos para cada categoría basado en las transacciones
  transactions.value.forEach(transaction => {
    if (transaction.amount < 0) { // Solo contar gastos (valores negativos)
      const concept = transaction.concept.toLowerCase();
      
      if (concept.includes('base:') || concept.includes('crear')) {
        categories[0].spent += Math.abs(transaction.amount);
      } else if (concept.includes('ubicación')) {
        categories[1].spent += Math.abs(transaction.amount);
      } else if (concept.includes('imagen')) {
        categories[2].spent += Math.abs(transaction.amount);
      } else if (concept.includes('texto largo')) {
        categories[3].spent += Math.abs(transaction.amount);
      } else {
        categories[4].spent += Math.abs(transaction.amount);
      }
    }
  });
  
  // Ordenar categorías de mayor a menor gasto
  return categories.sort((a, b) => b.spent - a.spent);
});

// Cálculo del porcentaje de gasto
const calculateSpendingPercentage = computed(() => {
  // Calcular el total de créditos gastados e ingresados
  let totalSpent = 0;
  let totalEarned = 0;
  
  transactions.value.forEach(transaction => {
    if (transaction.amount < 0) {
      totalSpent += Math.abs(transaction.amount);
    } else {
      totalEarned += transaction.amount;
    }
  });
  
  // Calcular el porcentaje de gasto en relación a los ingresos
  return totalEarned > 0 ? Math.min(100, Math.round((totalSpent / totalEarned) * 100)) : 0;
});

// Total de créditos gastados en la última semana
const calculateTotalSpent = computed(() => {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  let totalSpent = 0;
  transactions.value.forEach(transaction => {
    if (transaction.amount < 0 && transaction.date && transaction.date.toDate() >= oneWeekAgo) {
      totalSpent += Math.abs(transaction.amount);
    }
  });
  
  return totalSpent;
});

// Media de gasto por transacción
const calculateAverageSpending = computed(() => {
  const spendingTransactions = transactions.value.filter(t => t.amount < 0);
  if (spendingTransactions.length === 0) return 0;
  
  const totalSpent = spendingTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return Math.round((totalSpent / spendingTransactions.length) * 10) / 10;
});

// Calcular el porcentaje de una categoría en relación al total
function calculateCategoryPercentage(categorySpent) {
  const totalSpent = spendingCategories.value.reduce((sum, category) => sum + category.spent, 0);
  return totalSpent > 0 ? (categorySpent / totalSpent) * 100 : 0;
}

// Paquetes de créditos disponibles
const creditPackages = [
  { id: 1, name: "Paquete Iniciado", credits: 100, price: 4.99, icon: "mdi-coin" },
  { id: 2, name: "Paquete Aventurero", credits: 250, price: 9.99, icon: "mdi-treasure-chest" },
  { id: 3, name: "Paquete Caballero", credits: 500, price: 17.99, icon: "mdi-shield-crown" },
  { id: 4, name: "Paquete Rey", credits: 1000, price: 29.99, icon: "mdi-crown" }
];

// Costes de las acciones
const actionCosts = {
  createPost: 5,
  addLocation: 10,
  addImage: 8,
  longText: 3
};

// Cargar créditos del usuario
async function loadUserCredits() {
  if (!auth.currentUser) return;
  
  isLoading.value = true;
  try {
    const userCreditsData = await getUserCredits(auth.currentUser.uid);
    userCredits.value = userCreditsData.credits || 0;
    transactions.value = userCreditsData.transactions || [];
  } catch (err) {
    console.error("Error al cargar los créditos:", err);
    error.value = "Error al cargar los créditos.";
  } finally {
    isLoading.value = false;
  }
}

// Seleccionar un paquete para comprar
function selectPackage(pkg) {
  selectedPackage.value = pkg;
  purchaseDialog.value = true;
}

// Proceder al pago
function proceedToPayment() {
  purchaseDialog.value = false;
  paymentDialog.value = true;
}

// Manejar el pago exitoso con PayPal
async function handlePaypalSuccess(details) {
  if (!auth.currentUser || !selectedPackage.value) return;
  
  processingPayment.value = true;
  
  try {
    // Registrar la transacción y actualizar los créditos del usuario
    const success = await updateUserCredits(
      auth.currentUser.uid,
      selectedPackage.value.credits,
      `Compra de ${selectedPackage.value.name} (${selectedPackage.value.credits} créditos) - PayPal ID: ${details.orderId}`
    );
    
    if (success) {
      // Recargar créditos para reflejar el cambio
      await loadUserCredits();
      
      // Cerrar diálogo de pago y mostrar éxito
      paymentDialog.value = false;
      successDialog.value = true;
    } else {
      error.value = "No se pudo actualizar tu saldo de créditos.";
    }
  } catch (err) {
    console.error("Error al actualizar créditos:", err);
    error.value = "Error al actualizar tus créditos.";
  } finally {
    processingPayment.value = false;
  }
}

// Manejar errores de PayPal
function handlePaypalError(err) {
  console.error("Error en el pago con PayPal:", err);
  error.value = "Error en el proceso de pago con PayPal.";
}

// Simular el proceso de pago con tarjeta
async function simulateCardPayment() {
  if (!auth.currentUser || !selectedPackage.value) return;
  
  processingPayment.value = true;
  try {
    // Simular una pequeña demora para dar sensación de procesamiento
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Actualizar créditos después del "pago"
    const success = await updateUserCredits(
      auth.currentUser.uid,
      selectedPackage.value.credits,
      `Compra de ${selectedPackage.value.name} (${selectedPackage.value.credits} créditos) - Tarjeta`
    );
    
    if (success) {
      // Recargar créditos para reflejar el cambio
      await loadUserCredits();
      
      // Mostrar diálogo de éxito
      paymentDialog.value = false;
      successDialog.value = true;
    } else {
      error.value = "No se pudo procesar el pago.";
    }
  } catch (err) {
    console.error("Error al procesar el pago:", err);
    error.value = "Error al procesar el pago.";
  } finally {
    processingPayment.value = false;
  }
}

// Procesar pago según método seleccionado
function processPayment() {
  if (paymentMethod.value === 'card') {
    simulateCardPayment();
  }
  // El pago con PayPal se maneja directamente con el botón de PayPal
}

// Formatear fecha
function formatDate(timestamp) {
  if (!timestamp) return "";
  
  const date = timestamp.toDate();
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

// Setup inicial
onMounted(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      loadUserCredits();
    } else {
      userCredits.value = 0;
      transactions.value = [];
    }
  });
  
  // Limpiar el listener cuando el componente se desmonte
  return unsubscribe;
});
</script>

<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-center">Sistema de Créditos</h1>
        <div class="credits-banner">
          <div class="credits-circle">
            <img src="/assets/conejoKCD2.png" class="coin-image" alt="Moneda de conejo" />
            <div class="credits-amount">{{ userCredits }}</div>
            <div class="credits-label">créditos</div>
          </div>
        </div>
      </v-col>
    </v-row>
    
    <!-- Sección de compra de créditos -->
    <v-row>
      <v-col cols="12">
        <h2 class="text-center section-title">
          <v-icon left>mdi-shopping</v-icon>
          Comprar Créditos
        </h2>
      </v-col>
      
      <v-col cols="12" sm="6" md="3" v-for="pkg in creditPackages" :key="pkg.id">
        <v-card class="credit-package-card" elevation="4" @click="selectPackage(pkg)">
          <v-card-title class="package-title">
            {{ pkg.name }}
          </v-card-title>
          
          <v-card-text class="package-content">
            <div class="package-icon">
              <img src="/assets/conejoKCD2.png" class="package-coin-image" alt="Moneda de conejo" />
              <span class="package-coin-multiplier">×{{ pkg.credits }}</span>
            </div>
            <div class="package-credits">
              {{ pkg.credits }} créditos
            </div>
            <div class="package-price">
              {{ pkg.price }}€
            </div>
          </v-card-text>
          
          <v-card-actions>
            <v-btn block color="primary" class="buy-btn">
              <v-icon left>mdi-cash</v-icon>
              Comprar
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Sección explicativa de costes -->
    <v-row>
      <v-col cols="12">
        <h2 class="text-center section-title">
          <v-icon left>mdi-information-outline</v-icon>
          Costes de Acciones
        </h2>
        <v-card class="costs-card">
          <v-card-text>
            <v-list>
              <v-list-item>
                <v-list-item-icon>
                  <v-icon color="primary">mdi-note-plus</v-icon>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title>Crear un nuevo post</v-list-item-title>
                  <v-list-item-subtitle>{{ actionCosts.createPost }} créditos</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
              
              <v-list-item>
                <v-list-item-icon>
                  <v-icon color="primary">mdi-map-marker</v-icon>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title>Añadir ubicación al post</v-list-item-title>
                  <v-list-item-subtitle>{{ actionCosts.addLocation }} créditos adicionales</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
              
              <v-list-item>
                <v-list-item-icon>
                  <v-icon color="primary">mdi-image</v-icon>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title>Añadir imagen al post</v-list-item-title>
                  <v-list-item-subtitle>{{ actionCosts.addImage }} créditos adicionales</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
              
              <v-list-item>
                <v-list-item-icon>
                  <v-icon color="primary">mdi-text-long</v-icon>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title>Superar 280 caracteres en el texto</v-list-item-title>
                  <v-list-item-subtitle>{{ actionCosts.longText }} créditos adicionales</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Historial de transacciones -->
    <v-row>
      <v-col cols="12">
        <h2 class="text-center section-title">
          <v-icon left>mdi-history</v-icon>
          Historial de Transacciones
        </h2>
        
        <v-card class="transaction-card">
          <v-card-text v-if="isLoading">
            <div class="text-center">
              <v-progress-circular indeterminate color="primary"></v-progress-circular>
              <p>Cargando transacciones...</p>
            </div>
          </v-card-text>
          
          <v-data-table
            v-else
            :headers="[
              { text: 'Fecha', value: 'date', sortable: true },
              { text: 'Concepto', value: 'concept', sortable: false },
              { text: 'Cantidad', value: 'amount', sortable: true },
              { text: 'Saldo Después', value: 'balanceAfter', sortable: true }
            ]"
            :items="transactions.map(t => ({
              date: formatDate(t.date),
              concept: t.concept,
              amount: t.amount,
              balanceAfter: t.balanceAfter
            }))"
            :items-per-page="5"
            class="transactions-table"
            :footer-props="{
              itemsPerPageText: 'Filas por página:',
              itemsPerPageOptions: [5, 10, 15, 20],
              showFirstLastPage: true,
              firstIcon: 'mdi-page-first',
              lastIcon: 'mdi-page-last',
              prevIcon: 'mdi-chevron-left',
              nextIcon: 'mdi-chevron-right',
              pageText: '{0}-{1} de {2}'
            }"
          >
            <template v-slot:item.amount="{ item }">
              <span :class="item.amount > 0 ? 'positive-amount' : 'negative-amount'">
                {{ item.amount > 0 ? '+' : '' }}{{ item.amount }}
              </span>
            </template>
            <template v-slot:item.date="{ item }">
              <span class="transaction-text">{{ item.date }}</span>
            </template>
            <template v-slot:item.concept="{ item }">
              <span class="transaction-text">{{ item.concept }}</span>
            </template>
            <template v-slot:item.balanceAfter="{ item }">
              <span class="transaction-balance">{{ item.balanceAfter }}</span>
            </template>
            <template v-slot:header="{ props }">
              <tr>
                <th v-for="header in props.headers" :key="header.text" class="transaction-header">
                  {{ header.text }}
                </th>
              </tr>
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>

    <!-- Dashboard de Créditos -->
    <v-row>
      <v-col cols="12">
        <h2 class="text-center section-title">
          <v-icon left>mdi-chart-areaspline</v-icon>
          Dashboard de Créditos
        </h2>
      </v-col>

      <v-col cols="12" md="6">
        <v-card class="stats-card brown-stats-card">
          <v-card-title class="stats-card-title">
            <v-icon color="amber" class="mr-2">mdi-finance</v-icon>
            Uso de Créditos
          </v-card-title>
          
          <v-card-text class="stats-card-content">
            <div class="stats-circle-container">
              <div class="stats-circle">
                <div class="stats-percent">
                  <span class="percent-number">{{ calculateSpendingPercentage }}%</span>
                  <span class="percent-label">utilizado</span>
                </div>
                <svg width="150" height="150" viewBox="0 0 150 150">
                  <circle cx="75" cy="75" r="65" fill="none" stroke="#3a1c1a" stroke-width="12"/>
                  <circle cx="75" cy="75" r="65" fill="none" 
                    stroke="#ffc107" 
                    stroke-width="12"
                    stroke-dasharray="408"
                    :stroke-dashoffset="408 - (408 * calculateSpendingPercentage / 100)"
                    stroke-linecap="round"
                    transform="rotate(-90 75 75)"
                  />
                </svg>
              </div>
            </div>
            
            <div class="stats-details">
              <div class="stats-detail-item">
                <div class="detail-label">Créditos gastados (última semana)</div>
                <div class="detail-value">{{ calculateTotalSpent }}</div>
              </div>
              
              <div class="stats-detail-item">
                <div class="detail-label">Transacciones realizadas</div>
                <div class="detail-value">{{ transactions.length }}</div>
              </div>
              
              <div class="stats-detail-item">
                <div class="detail-label">Media de gasto por transacción</div>
                <div class="detail-value">{{ calculateAverageSpending }}</div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      
      <v-col cols="12" md="6">
        <v-card class="stats-card brown-stats-card">
          <v-card-title class="stats-card-title">
            <v-icon color="amber" class="mr-2">mdi-chart-bar</v-icon>
            Categorías de Gastos
          </v-card-title>
          
          <v-card-text class="spending-categories">
            <div class="category-container">
              <div class="category-item" v-for="(category, index) in spendingCategories" :key="index">
                <div class="category-info">
                  <v-icon :color="categoryColors[index % categoryColors.length]" class="mr-2">{{ categoryIcons[index % categoryIcons.length] }}</v-icon>
                  <span class="category-name">{{ category.name }}</span>
                </div>
                <div class="category-bar-container">
                  <div class="category-bar" 
                    :style="{ 
                      width: `${calculateCategoryPercentage(category.spent)}%`,
                      backgroundColor: categoryColors[index % categoryColors.length]
                    }"
                  ></div>
                </div>
                <div class="category-value">{{ category.spent }}</div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Diálogo de confirmación de compra -->
    <v-dialog v-model="purchaseDialog" max-width="400px">
      <v-card class="dialog-card">
        <v-card-title class="dialog-title">
          Confirmar compra
        </v-card-title>
        
        <v-card-text v-if="selectedPackage">
          <div class="purchase-summary">
            <h3>{{ selectedPackage.name }}</h3>
            <div class="purchase-detail">
              <div><v-icon color="amber">mdi-coins</v-icon> {{ selectedPackage.credits }} créditos</div>
              <div><v-icon color="green">mdi-cash</v-icon> {{ selectedPackage.price }}€</div>
            </div>
            <p class="purchase-info">Estás a punto de comprar {{ selectedPackage.credits }} créditos por {{ selectedPackage.price }}€</p>
          </div>
        </v-card-text>
        
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey darken-1" text @click="purchaseDialog = false">
            Cancelar
          </v-btn>
          <v-btn color="primary" @click="proceedToPayment">
            Confirmar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo de pago -->
    <v-dialog v-model="paymentDialog" max-width="500px">
      <v-card class="dialog-card">
        <v-card-title class="dialog-title">
          Método de pago
        </v-card-title>
        
        <v-card-text>
          <v-radio-group v-model="paymentMethod">
            <v-radio value="paypal" label="PayPal">
              <template v-slot:label>
                <div class="payment-option">
                  <img src="https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_37x23.jpg" alt="PayPal" height="25">
                  <span class="ml-2">PayPal</span>
                </div>
              </template>
            </v-radio>
            <v-radio value="card" label="Tarjeta de crédito">
              <template v-slot:label>
                <div class="payment-option">
                  <v-icon>mdi-credit-card</v-icon>
                  <span class="ml-2">Tarjeta de crédito</span>
                </div>
              </template>
            </v-radio>
          </v-radio-group>
          
          <div v-if="paymentMethod === 'paypal'" class="payment-form">
            <p class="payment-intro">Usa PayPal para pagar de forma segura:</p>
            <!-- Botón real de PayPal -->
            <PayPalButton 
              v-if="selectedPackage"
              :amount="selectedPackage.price"
              :packageInfo="selectedPackage"
              :onSuccess="handlePaypalSuccess"
              :onError="handlePaypalError"
            />
            <p class="paypal-terms">
              Declaras conocer las condiciones del servicio que PayPal presta al vendedor 
              y aceptas la <a href="https://www.paypal.com/es/webapps/mpp/ua/privacy-full" 
              target="_blank" rel="noopener">Declaración de privacidad</a>. 
              No se requiere una cuenta PayPal.
            </p>
          </div>
          
          <div v-if="paymentMethod === 'card'" class="payment-form">
            <v-text-field label="Número de tarjeta" placeholder="1234 5678 9012 3456" outlined></v-text-field>
            <div class="d-flex">
              <v-text-field label="MM/AA" placeholder="MM/AA" class="mr-2" outlined></v-text-field>
              <v-text-field label="CVC" placeholder="CVC" outlined></v-text-field>
            </div>
            <v-text-field label="Nombre en la tarjeta" outlined></v-text-field>
            
            <p class="paypal-terms">
              Declaras conocer las condiciones del servicio que PayPal presta al vendedor 
              y aceptas la <a href="https://www.paypal.com/es/webapps/mpp/ua/privacy-full" 
              target="_blank" rel="noopener">Declaración de privacidad</a>. 
              No se requiere una cuenta PayPal.
            </p>
          </div>
          
          <v-alert v-if="error" type="error" class="mt-3">{{ error }}</v-alert>
        </v-card-text>
        
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey darken-1" text @click="paymentDialog = false">
            Cancelar
          </v-btn>
          <v-btn 
            v-if="paymentMethod === 'card'"
            color="primary" 
            @click="processPayment"
            :loading="processingPayment"
            :disabled="processingPayment"
          >
            Pagar {{ selectedPackage?.price }}€
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo de éxito -->
    <v-dialog v-model="successDialog" max-width="400px">
      <v-card class="dialog-card success-dialog">
        <v-card-text class="text-center py-5">
          <v-icon color="green" x-large>mdi-check-circle</v-icon>
          <h2 class="success-title">¡Compra completada!</h2>
          <p class="success-message">Has adquirido {{ selectedPackage?.credits }} créditos correctamente.</p>
          <p class="success-balance">Tu saldo actual es de {{ userCredits }} créditos.</p>
        </v-card-text>
        
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" @click="successDialog = false">
            Aceptar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap');

.credits-banner {
  display: flex;
  justify-content: center;
  margin: 20px 0 30px;
}

.credits-circle {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background-color: #4a2c2a;
  border: 4px solid #8b4513;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  position: relative;
  overflow: hidden;
}

.coin-image {
  width: 60px;
  height: 60px;
  object-fit: contain;
  margin-bottom: 5px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.package-coin-image {
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.package-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 15px;
}

.package-coin-multiplier {
  position: absolute;
  right: -15px;
  bottom: -5px;
  background-color: #3a1c1a;
  color: #ffc107;
  border: 1px solid #8b4513;
  border-radius: 50%;
  padding: 2px 6px;
  font-size: 12px;
  font-weight: bold;
  font-family: 'MedievalSharp', cursive;
}

.credits-amount {
  font-family: 'MedievalSharp', cursive;
  font-size: 2.5rem;
  color: #ffc107;
  font-weight: bold;
  margin: 5px 0;
}

.credits-label {
  font-family: 'Cinzel', serif;
  color: #d0b49f;
}

.section-title {
  font-family: 'MedievalSharp', cursive;
  color: #f9ebd7;
  margin: 30px 0 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.credit-package-card {
  background-color: #4a2c2a !important;
  color: #f9ebd7 !important;
  border: 2px solid #8b4513;
  transition: all 0.3s ease;
  cursor: pointer;
  height: 100%;
}

.credit-package-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 20px rgba(0, 0, 0, 0.4) !important;
  border-color: #ffc107;
}

.package-title {
  font-family: 'MedievalSharp', cursive;
  text-align: center;
  background-color: #3a1c1a;
  padding: 15px !important;
  border-bottom: 2px solid #8b4513;
  font-size: 1.1rem !important;
}

.package-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px !important;
}

.package-icon {
  margin-bottom: 15px;
}

.package-credits {
  font-family: 'Cinzel', serif;
  font-size: 1.5rem;
  color: #ffc107;
  margin-bottom: 5px;
}

.package-price {
  font-family: 'Cinzel', serif;
  color: #d0b49f;
  font-size: 1.2rem;
}

.buy-btn {
  background-color: #8b4513 !important;
  color: #f9ebd7 !important;
  font-family: 'MedievalSharp', cursive;
}

.costs-card, .transaction-card {
  background-color: #4a2c2a !important;
  border: 2px solid #8b4513;
}

.transactions-table {
  background-color: #4a2c2a !important;
}

.positive-amount {
  color: #4CAF50;
  font-weight: bold;
}

.negative-amount {
  color: #F44336;
  font-weight: bold;
}

.dialog-card {
  background-color: #4a2c2a !important;
  color: #f9ebd7;
  border: 3px solid #8b4513;
}

.dialog-title {
  background-color: #3a1c1a;
  font-family: 'MedievalSharp', cursive;
}

.purchase-summary {
  text-align: center;
  padding: 20px 0;
}

.purchase-summary h3 {
  font-family: 'MedievalSharp', cursive;
  color: #ffc107;
  margin-bottom: 20px;
}

.purchase-detail {
  display: flex;
  justify-content: space-around;
  margin-bottom: 20px;
}

.purchase-info {
  font-style: italic;
  color: #d0b49f;
  margin-top: 10px;
}

.payment-option {
  display: flex;
  align-items: center;
}

.payment-form {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 5px;
}

.success-dialog {
  background-color: #4a2c2a !important;
}

.success-title {
  font-family: 'MedievalSharp', cursive;
  color: #4CAF50;
  margin: 15px 0;
}

.success-message {
  color: #d0b49f;
  margin-bottom: 10px;
}

.success-balance {
  font-family: 'Cinzel', serif;
  color: #ffc107;
  font-size: 1.2rem;
  margin-top: 15px;
}

.payment-intro {
  margin-bottom: 15px;
  color: #d0b49f;
  font-style: italic;
  text-align: center;
}

.paypal-terms {
  margin-top: 15px;
  font-size: 0.9rem;
  text-align: center;
  background-color: rgba(255, 207, 64, 0.2);
  border: 1px solid #ffc107;
  padding: 10px;
  border-radius: 5px;
  font-weight: 500;
  color: #f9ebd7;
}

.paypal-terms a {
  color: #ffc107;
  text-decoration: underline;
  font-weight: 600;
}

.paypal-terms a:hover {
  color: #ffeb3b;
}

.transaction-text {
  color: antiquewhite;
  font-weight: 500;
  font-family: 'Cinzel', serif;
}

.transaction-balance {
  color: #ffc107;
  font-weight: bold;
  font-family: 'MedievalSharp', cursive;
}

.transaction-header {
  color: #ffc107 !important;
  font-family: 'MedievalSharp', cursive;
  font-weight: bold;
  font-size: 1.1rem;
}

/* Estilos para mejorar la tabla de transacciones */
:deep(.v-data-table) {
  background-color: transparent !important;
}

:deep(.v-data-table > .v-data-table__wrapper > table > thead > tr > th) {
  color: #ffc107 !important;
  font-family: 'MedievalSharp', cursive !important;
  background-color: #3a1c1a !important;
  border-bottom: 2px solid #8b4513 !important;
}

:deep(.v-data-table > .v-data-table__wrapper > table > tbody > tr:hover:not(.v-data-table__expanded__content)) {
  background-color: rgba(255, 207, 64, 0.1) !important;
}

:deep(.v-data-table > .v-data-table__wrapper > table > tbody > tr > td) {
  border-bottom: 1px solid rgba(139, 69, 19, 0.5) !important;
  color: antiquewhite !important;
}

:deep(.theme--dark.v-data-table .v-data-footer) {
  background-color: #3a1c1a !important;
  border-top: 2px solid #8b4513 !important;
}

:deep(.theme--dark.v-data-table .v-data-footer .v-data-footer__select .v-select__selection--comma) {
  color: antiquewhite !important;
}

:deep(.theme--dark.v-data-table .v-data-footer .v-data-footer__pagination) {
  color: antiquewhite !important;
}

/* Estilos para el footer de la tabla */
:deep(.v-data-table__footer) {
  padding: 10px;
  background-color: #3a1c1a !important;
  border-top: 2px solid #8b4513;
}

/* Estilo para el texto "Filas por página" */
:deep(.v-data-footer__select) {
  color: antiquewhite !important;
  font-family: 'Cinzel', serif;
  margin-right: 15px;
}

/* Estilo para el selector de número de filas */
:deep(.v-data-footer__select .v-input__slot) {
  background-color: rgba(255, 193, 7, 0.1) !important;
  border: 1px solid #8b4513 !important;
}

:deep(.v-select__selection) {
  color: #ffc107 !important;
  font-weight: bold;
}

:deep(.v-data-footer__pagination) {
  color: antiquewhite !important;
  font-family: 'Cinzel', serif;
  margin-left: 10px;
}

/* Estilo para los botones de navegación */
:deep(.v-data-footer__icons-before .v-btn),
:deep(.v-data-footer__icons-after .v-btn) {
  color: #ffc107 !important;
}

:deep(.v-data-footer__icons-before .v-btn:hover),
:deep(.v-data-footer__icons-after .v-btn:hover) {
  background-color: rgba(255, 193, 7, 0.1) !important;
}

:deep(.v-data-footer__icons-before .v-btn:disabled),
:deep(.v-data-footer__icons-after .v-btn:disabled) {
  color: rgba(255, 193, 7, 0.3) !important;
}

/* Estilo para el texto "1-4 of 4" */
:deep(.v-data-footer__info) {
  color: antiquewhite !important;
  font-weight: 500;
  font-family: 'Cinzel', serif;
}

.brown-stats-card {
  background-color: #4a2c2a !important;
  border: 2px solid #8b4513 !important;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3) !important;
}

.stats-card-title {
  background-color: #3a1c1a !important;
  color: #f9ebd7 !important;
  font-family: 'MedievalSharp', cursive !important;
  padding: 16px !important;
  border-bottom: 2px solid #8b4513 !important;
}

.stats-card-content {
  padding: 20px !important;
  color: #f9ebd7 !important;
}

.stats-circle-container {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.stats-circle {
  position: relative;
  width: 150px;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stats-percent {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.percent-number {
  font-family: 'MedievalSharp', cursive;
  font-size: 2.5rem;
  color: #ffc107;
  font-weight: bold;
}

.percent-label {
  font-family: 'Cinzel', serif;
  font-size: 0.9rem;
  color: #d0b49f;
}

.stats-details {
  margin-top: 20px;
}

.stats-detail-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 4px;
  background-color: rgba(139, 69, 19, 0.2);
}

.detail-label {
  font-family: 'Cinzel', serif;
  color: #d0b49f;
}

.detail-value {
  font-family: 'MedievalSharp', cursive;
  color: #ffc107;
  font-weight: bold;
}

/* Estilos para las categorías de gastos */
.spending-categories {
  padding: 10px !important;
}

.category-container {
  margin-top: 10px;
}

.category-item {
  margin-bottom: 15px;
}

.category-info {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
}

.category-name {
  font-family: 'Cinzel', serif;
  color: #f9ebd7;
}

.category-bar-container {
  height: 12px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
  margin: 5px 0;
}

.category-bar {
  height: 100%;
  border-radius: 6px;
}

.category-value {
  font-family: 'MedievalSharp', cursive;
  color: #ffc107;
  font-weight: bold;
  text-align: right;
}
</style>