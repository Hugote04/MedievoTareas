<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'EUR'
  },
  onSuccess: {
    type: Function,
    required: true
  },
  onError: {
    type: Function,
    default: () => {}
  },
  packageInfo: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const paypalButtonContainer = ref(null);
const loading = ref(true);
const error = ref(false);
const errorMessage = ref('');
const acceptedTerms = ref(true);
let paypalButtonInstance = null;

// Función para cargar el script de PayPal y renderizar el botón
const loadAndRenderPayPalButton = async () => {
  if (!paypalButtonContainer.value) return;
  
  loading.value = true;
  error.value = false;
  errorMessage.value = '';
  
  try {
    // Importar dinámicamente la librería de PayPal
    const { loadScript } = await import('@paypal/paypal-js');
    
    // Cargar el script de PayPal con tus credenciales
    const paypal = await loadScript({
      'client-id': 'AS61ovVAgMicvpIYYkO-CCKOPNHNPlbg4p_wk5znDhOJt-10E_GX3iO6j5uyB1PujNSiVM6A-Yx38qYr',
      currency: props.currency,
      intent: 'capture'
    });
    
    // Limpiar el contenedor por si ya tenía un botón
    if (paypalButtonContainer.value) {
      paypalButtonContainer.value.innerHTML = '';
    }
    
    // Renderizar el botón de PayPal
    paypalButtonInstance = paypal.Buttons({
      style: {
        shape: 'rect',
        color: 'gold',
        layout: 'vertical',
        label: 'pay',
        height: 55
      },
      
      // Configurar la transacción cuando se haga clic en el botón
      createOrder: (data, actions) => {
        if (!acceptedTerms.value) {
          return Promise.reject(new Error('Debes aceptar los términos y condiciones para continuar'));
        }
        
        return actions.order.create({
          purchase_units: [{
            amount: {
              value: props.amount.toFixed(2),
              currency_code: props.currency
            },
            description: `Compra de ${props.packageInfo.credits} créditos - ${props.packageInfo.name}`
          }]
        });
      },
      
      // Cuando la transacción se completa con éxito
      onApprove: async (data, actions) => {
        try {
          // Capturar el pago
          const orderDetails = await actions.order.capture();
          
          // Llamar al callback de éxito con los detalles de la orden
          props.onSuccess({
            orderId: orderDetails.id,
            status: orderDetails.status,
            payerEmail: orderDetails.payer?.email_address,
            amount: orderDetails.purchase_units[0].amount.value,
            currency: orderDetails.purchase_units[0].amount.currency_code,
            package: props.packageInfo,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error al capturar el pago:', error);
          errorMessage.value = 'Error al procesar el pago. Por favor intenta nuevamente.';
          error.value = true;
          props.onError(error);
        }
      },
      
      // Cuando ocurre un error
      onError: (err) => {
        console.error('Error en el botón de PayPal:', err);
        errorMessage.value = 'Error al cargar el botón de PayPal. Por favor intenta nuevamente.';
        error.value = true;
        props.onError(err);
      }
    });
    
    // Renderizar el botón en el contenedor
    if (paypalButtonContainer.value) {
      await paypalButtonInstance.render(paypalButtonContainer.value);
      loading.value = false;
    }
  } catch (error) {
    console.error('Error al cargar el script de PayPal:', error);
    errorMessage.value = 'No se pudo cargar el servicio de PayPal. Por favor intenta nuevamente más tarde.';
    error.value = true;
    loading.value = false;
    props.onError(error);
  }
};

// Observar cambios en el monto para actualizar el botón si es necesario
watch(() => props.amount, () => {
  // Si cambia el monto, volver a renderizar el botón
  loadAndRenderPayPalButton();
});

// Cargar el botón cuando el componente se monta
onMounted(() => {
  loadAndRenderPayPalButton();
});

// Limpiar cuando el componente se desmonta
onUnmounted(() => {
  if (paypalButtonInstance && typeof paypalButtonInstance.close === 'function') {
    paypalButtonInstance.close();
  }
});
</script>

<template>
  <v-card variant="outlined" class="paypal-card rounded-lg pa-4" :disabled="disabled">
    <v-card-title class="text-h6 pb-2">
      <v-icon start color="amber-darken-2" class="mr-2">mdi-credit-card-outline</v-icon>
      Pagar con PayPal
    </v-card-title>
    
    <v-card-text class="pa-0">
      <!-- PayPal Button Container -->
      <div class="paypal-button-container">
        <!-- Loading state -->
        <v-progress-circular
          v-if="loading"
          indeterminate
          color="amber-darken-2"
          size="32"
          class="my-4"
        ></v-progress-circular>
        
        <!-- Error state -->
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="my-2"
        >
          {{ errorMessage }}
        </v-alert>
        
        <!-- PayPal button -->
        <div 
          ref="paypalButtonContainer" 
          class="paypal-button" 
          :class="{ 'invisible': loading || error || disabled }"
        ></div>
      </div>
      
      <!-- Terms and conditions -->
      <v-sheet color="amber-lighten-5" rounded="lg" class="mt-3 px-3 py-2">
        <v-checkbox
          v-model="acceptedTerms"
          density="compact"
          hide-details
          color="amber-darken-2"
          :disabled="disabled"
        >
          <template v-slot:label>
            <span class="text-body-2">
              Declaras conocer las 
              <v-btn 
                variant="text" 
                color="amber-darken-2" 
                density="compact" 
                size="x-small"
                href="https://www.paypal.com/es/webapps/mpp/ua/servicedescription-full"
                target="_blank"
                rel="noopener"
              >
                condiciones del servicio
              </v-btn>
              que PayPal presta al vendedor y aceptas la
              <v-btn 
                variant="text" 
                color="amber-darken-2" 
                density="compact" 
                size="x-small"
                href="https://www.paypal.com/es/webapps/mpp/ua/privacy-full"
                target="_blank"
                rel="noopener"
              >
                Declaración de privacidad
              </v-btn>.
              No se requiere una cuenta PayPal.
            </span>
          </template>
        </v-checkbox>
      </v-sheet>
      
      <!-- Payment info -->
      <v-sheet color="grey-darken-4" rounded="lg" class="mt-3 px-3 py-2">
        <div class="d-flex justify-space-between align-center">
          <div class="text-body-2">Total a pagar:</div>
          <div class="text-h6">{{ amount.toFixed(2) }} {{ currency }}</div>
        </div>
        
        <div class="d-flex justify-space-between align-center mt-1">
          <div class="text-caption text-grey-lighten-1">Paquete:</div>
          <div class="text-body-1">{{ packageInfo.name }}</div>
        </div>
        
        <div class="d-flex justify-space-between align-center mt-1">
          <div class="text-caption text-grey-lighten-1">Créditos:</div>
          <div class="text-body-1">{{ packageInfo.credits }}</div>
        </div>
      </v-sheet>
      
      <!-- Security badges -->
      <div class="d-flex justify-center align-center gap-2 mt-3">
        <v-icon icon="mdi-shield-check" color="amber-lighten-1" size="small"></v-icon>
        <span class="text-caption text-grey-lighten-1">Pago seguro</span>
        
        <v-divider vertical class="mx-2"></v-divider>
        
        <v-icon icon="mdi-lock" color="amber-lighten-1" size="small"></v-icon>
        <span class="text-caption text-grey-lighten-1">Conexión encriptada</span>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.paypal-card {
  background-color: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 193, 7, 0.2);
}

.paypal-button-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 55px;
  width: 100%;
}

.paypal-button {
  width: 100%;
  min-height: 55px;
  border-radius: 8px;
  overflow: hidden;
}

.invisible {
  visibility: hidden;
}

/* Estilos para los textos dinámicos de PayPal que vienen en el iframe */
:deep(.paypal-button-label-container) {
  color: #2c2e2f !important;
}

:deep(.paypal-button-tagline) {
  color: #2c2e2f !important;
}

:deep(.paypal-button-text) {
  color: #ffffff !important;
  text-shadow: 0px 0px 2px rgba(0, 0, 0, 0.5);
}
</style>