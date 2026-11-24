<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type {
  AdditionalCharge,
  ClientDetails,
  Product,
  QuoteItem,
} from './types'
import { calculateCharges, calculateProductSubtotal } from './utils/calculations'
import { formatCurrency, formatDate } from './utils/formatters'
import { importCatalog } from './utils/importCatalog'

const storageKey = 'presupuestos-app-v1'
const today = new Date()
const localDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateInput = localDateInput(today)
const quoteNumber = ref(
  `PRES-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(today.getHours()).padStart(2, '0')}${String(today.getMinutes()).padStart(2, '0')}`,
)

const sampleProducts: Product[] = [
  { id: 'm1', name: 'Taladro percutor 750 W', brand: 'Bosch', model: 'GSB 16 RE', price: 184500, category: 'Herramientas', sku: 'BOS-016' },
  { id: 'm2', name: 'Amoladora angular 4 1/2"', brand: 'Makita', model: '9557HNG', price: 136900, category: 'Herramientas', sku: 'MAK-557' },
  { id: 'm3', name: 'Cable unipolar 2,5 mm²', brand: 'Prysmian', model: 'Afumex', price: 1820, category: 'Electricidad', sku: 'PRY-25' },
  { id: 'm4', name: 'Tablero eléctrico 8 módulos', brand: 'Genrod', model: 'T8', price: 22750, category: 'Electricidad', sku: 'GEN-T8' },
  { id: 'm5', name: 'Caño PVC 110 mm x 4 m', brand: 'Awaduct', model: '110-4', price: 31500, category: 'Sanitarios', sku: 'AWA-110' },
  { id: 'm6', name: 'Grifería monocomando cocina', brand: 'FV', model: 'Arizona', price: 198000, category: 'Sanitarios', sku: 'FV-ARZ' },
]

interface SavedState {
  catalog: Product[]
  items: QuoteItem[]
  charges: AdditionalCharge[]
  client: ClientDetails
  issuer: ClientDetails
  quoteNumber: string
  quoteDate: string
  demoCatalog: boolean
  marginPercent: number
}

const emptyDetails = (): ClientDetails => ({
  name: '',
  taxId: '',
  email: '',
  phone: '',
  address: '',
})

const defaultCharges = (): AdditionalCharge[] => [
  { id: 'iva', name: 'IVA', type: 'percent', value: 21, base: 'products', productId: '', audience: 'commercial' },
  { id: 'envio', name: 'Envío', type: 'fixed', value: 8500, base: 'products', productId: '', audience: 'commercial' },
]

function restoreState(): Partial<SavedState> {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return {}
    const parsed: unknown = JSON.parse(saved)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Partial<SavedState>
    }
  } catch (error) {
    console.error('No se pudo recuperar el presupuesto guardado.', error)
  }
  return {}
}

const restored = restoreState()
const catalog = ref<Product[]>(
  Array.isArray(restored.catalog) ? restored.catalog : sampleProducts,
)
const quoteItems = ref<QuoteItem[]>(Array.isArray(restored.items) ? restored.items : [])
const charges = ref<AdditionalCharge[]>(
  Array.isArray(restored.charges)
    ? restored.charges.map((charge) => ({
        ...charge,
        audience: charge.audience ?? 'commercial',
      }))
    : defaultCharges(),
)
const marginPercent = ref(restored.marginPercent ?? 30)
const client = reactive<ClientDetails>(
  restored.client ? { ...emptyDetails(), ...restored.client } : emptyDetails(),
)
const issuer = reactive<ClientDetails>(
  restored.issuer
    ? { ...emptyDetails(), ...restored.issuer }
    : { ...emptyDetails(), name: 'Mi empresa' },
)
const quoteDate = ref(restored.quoteDate ?? dateInput)
if (restored.quoteNumber) quoteNumber.value = restored.quoteNumber

const search = ref('')
const brandFilter = ref('')
const categoryFilter = ref('')
const importMessage = ref('')
const importErrors = ref<string[]>([])
const storageError = ref('')
const exportMode = ref<'internal' | 'customer'>('customer')
const showDetails = ref(false)
const showIssuer = ref(false)
const newChargeName = ref('')
const newChargeType = ref<'fixed' | 'percent'>('fixed')
const newChargeBase = ref<'products' | 'accumulated' | 'product'>('products')
const newChargeAudience = ref<'internal' | 'commercial'>('commercial')
const newChargeProductId = ref('')
const isDemoCatalog = ref(restored.demoCatalog ?? !Array.isArray(restored.catalog))
const fileInput = ref<HTMLInputElement | null>(null)

const brands = computed(() =>
  [...new Set(catalog.value.map((product) => product.brand).filter(Boolean))].sort(),
)
const categories = computed(() =>
  [...new Set(catalog.value.map((product) => product.category).filter(Boolean))].sort(),
)
const filteredProducts = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('es')
  return catalog.value.filter((product) => {
    const matchesText =
      !query ||
      [product.name, product.model, product.sku]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query)
    return (
      matchesText &&
      (!brandFilter.value || product.brand === brandFilter.value) &&
      (!categoryFilter.value || product.category === categoryFilter.value)
    )
  })
})
const quoteProducts = computed(() =>
  quoteItems.value.flatMap((item) => {
    const product = catalog.value.find((entry) => entry.id === item.productId)
    if (!product) return []
    const saleUnitPrice = product.price * (1 + marginPercent.value / 100)
    return [{
      ...item,
      quoteItem: item,
      product,
      saleUnitPrice,
      costAmount: product.price * item.quantity,
      marginAmount: product.price * item.quantity * marginPercent.value / 100,
      saleAmount: saleUnitPrice * item.quantity,
    }]
  }),
)
const costSubtotal = computed(() =>
  calculateProductSubtotal(quoteItems.value, catalog.value),
)
const marginAmount = computed(() => costSubtotal.value * marginPercent.value / 100)
const subtotal = computed(() => costSubtotal.value + marginAmount.value)
const calculatedCharges = computed(() =>
  calculateCharges(quoteItems.value, charges.value, catalog.value, marginPercent.value),
)
const internalChargesTotal = computed(() =>
  calculatedCharges.value
    .filter((entry) => entry.charge.audience === 'internal')
    .reduce((sum, entry) => sum + entry.amount, 0),
)
const internalCostTotal = computed(() => costSubtotal.value + internalChargesTotal.value)
const commercialChargesTotal = computed(() =>
  calculatedCharges.value
    .filter((entry) => entry.charge.audience === 'commercial')
    .reduce((sum, entry) => sum + entry.amount, 0),
)
const netProfit = computed(() => marginAmount.value - internalChargesTotal.value)
const total = computed(() => subtotal.value + commercialChargesTotal.value)
const totalUnits = computed(() =>
  quoteItems.value.reduce((sum, item) => sum + item.quantity, 0),
)

watch(
  [catalog, quoteItems, charges, client, issuer, quoteNumber, quoteDate, marginPercent],
  () => {
    try {
      const state: SavedState = {
        catalog: catalog.value,
        items: quoteItems.value,
        charges: charges.value,
        client: { ...client },
        issuer: { ...issuer },
        quoteNumber: quoteNumber.value,
        quoteDate: quoteDate.value,
        demoCatalog: isDemoCatalog.value,
        marginPercent: marginPercent.value,
      }
      localStorage.setItem(storageKey, JSON.stringify(state))
      storageError.value = ''
    } catch (error) {
      console.error('No se pudo guardar el presupuesto en este dispositivo.', error)
      storageError.value = 'No se pudo guardar automáticamente en este dispositivo.'
    }
  },
  { deep: true, immediate: true },
)

function addProduct(product: Product) {
  const existing = quoteItems.value.find((item) => item.productId === product.id)
  if (existing) existing.quantity += 1
  else quoteItems.value.push({ productId: product.id, quantity: 1 })
}

function removeProduct(productId: string) {
  quoteItems.value = quoteItems.value.filter((item) => item.productId !== productId)
  charges.value.forEach((charge) => {
    if (charge.base === 'product' && charge.productId === productId) {
      charge.productId = ''
    }
  })
}

function updateQuantity(item: QuoteItem) {
  if (!Number.isFinite(item.quantity) || item.quantity < 1) item.quantity = 1
  item.quantity = Math.floor(item.quantity)
}

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importMessage.value = ''
  importErrors.value = []

  try {
    const result = await importCatalog(file)
    importErrors.value = result.errors
    if (result.products.length > 0) {
      catalog.value = result.products
      isDemoCatalog.value = false
      quoteItems.value = quoteItems.value.filter((item) =>
        result.products.some((product) => product.id === item.productId),
      )
      importMessage.value = `${result.products.length} productos cargados correctamente.`
    } else {
      importMessage.value = 'No se cargó ningún producto. Revisá el formato del archivo.'
    }
  } catch (error) {
    console.error('Error al leer el archivo de catálogo.', error)
    importErrors.value = ['No se pudo leer el archivo. Verificá que sea un Excel o CSV válido.']
  } finally {
    input.value = ''
  }
}

function downloadTemplate() {
  const content = [
    'Nombre,Marca,Modelo,Precio,Categoría,Código/SKU',
    'Taladro percutor 750 W,Bosch,GSB 16 RE,184500,Herramientas,BOS-016',
    '"Cable unipolar 2,5 mm²",Prysmian,Afumex,1820,Electricidad,PRY-25',
  ].join('\r\n')
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'plantilla-catalogo.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function addCharge() {
  const name = newChargeName.value.trim()
  if (
    !name ||
    (newChargeType.value === 'percent' &&
      newChargeBase.value === 'product' &&
      !newChargeProductId.value)
  ) return
  charges.value.push({
    id: crypto.randomUUID(),
    name,
    type: newChargeType.value,
    value: 0,
    base: newChargeType.value === 'fixed' ? 'products' : newChargeBase.value,
    productId: newChargeBase.value === 'product' ? newChargeProductId.value : '',
    audience: newChargeAudience.value,
  })
  newChargeName.value = ''
  newChargeProductId.value = ''
  newChargeAudience.value = 'commercial'
}

function removeCharge(id: string) {
  charges.value = charges.value.filter((charge) => charge.id !== id)
}

async function printQuote(mode: 'internal' | 'customer') {
  exportMode.value = mode
  await nextTick()
  const previousTitle = document.title
  document.title = `Presupuesto ${mode === 'internal' ? 'interno' : 'cliente'} ${quoteNumber.value}`
  window.print()
  document.title = previousTitle
}

function resetQuote() {
  if (!window.confirm('¿Querés vaciar los productos y adicionales de este presupuesto?')) return
  quoteItems.value = []
  charges.value = defaultCharges()
  marginPercent.value = 30
  client.name = ''
  client.taxId = ''
  client.email = ''
  client.phone = ''
  client.address = ''
  const now = new Date()
  quoteNumber.value = `PRES-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  quoteDate.value = localDateInput(new Date())
}

function chargeBaseLabel(charge: AdditionalCharge, baseAmount: number): string {
  if (charge.type === 'fixed') return 'Monto fijo'
  const audienceLabel = charge.audience === 'internal' ? 'costo interno' : 'subtotal cliente'
  if (charge.base === 'accumulated') return `Acumulado ${charge.audience === 'internal' ? 'interno' : 'cliente'} · ${formatCurrency(baseAmount)}`
  if (charge.base === 'product') {
    const product = catalog.value.find((entry) => entry.id === charge.productId)
    return product
      ? `${product.name} (${audienceLabel}) · ${formatCurrency(baseAmount)}`
      : 'Elegí un producto'
  }
  return `${audienceLabel[0].toUpperCase()}${audienceLabel.slice(1)} · ${formatCurrency(baseAmount)}`
}

function quoteDateLabel(value: string): string {
  if (!value) return '—'
  const [year, month, day] = value.split('-').map(Number)
  return formatDate(new Date(year, month - 1, day))
}

onMounted(() => {
  document.title = 'Presupuestador · Presupuestos'
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar no-print">
      <a class="brand-lockup" href="#" aria-label="Presupuestos, inicio">
        <span class="brand-mark">p.</span>
        <span class="brand-name">presupuestos<span class="brand-dot">.</span></span>
      </a>
      <div class="topbar-right">
        <span class="save-status"><span class="status-dot"></span> Guardado automáticamente</span>
        <button class="button button-outline" :disabled="quoteItems.length === 0" @click="printQuote('internal')">
          PDF interno
        </button>
        <button class="button button-dark" :disabled="quoteItems.length === 0" @click="printQuote('customer')">
          <span aria-hidden="true">↗</span> PDF cliente
        </button>
      </div>
    </header>

    <main class="workspace no-print">
      <section class="page-heading">
        <div>
          <p class="eyebrow">VENTAS <span>/</span> NUEVO DOCUMENTO</p>
          <h1>Armá tu presupuesto<span class="heading-period">.</span></h1>
          <p class="page-subtitle">Elegí productos, ajustá los detalles y compartilo con tu cliente.</p>
        </div>
        <button class="button button-quiet" @click="resetQuote">Nuevo presupuesto</button>
      </section>

      <div v-if="storageError" class="notice notice-error" role="status">{{ storageError }}</div>
      <div v-if="importMessage" class="notice" role="status">{{ importMessage }}</div>
      <div v-if="importErrors.length" class="notice notice-error" role="alert">
        <strong>Revisá estos datos:</strong>
        <ul><li v-for="error in importErrors" :key="error">{{ error }}</li></ul>
      </div>

      <section class="content-grid">
        <div class="catalog-column">
          <section class="panel catalog-panel">
            <div class="panel-heading">
              <div>
                <div class="section-kicker"><span class="step-number">01</span> CATÁLOGO</div>
                <h2>Productos</h2>
                <p class="muted">{{ catalog.length }} productos disponibles</p>
              </div>
              <div class="catalog-actions">
                <button class="text-button" @click="downloadTemplate">Descargar plantilla</button>
                <button class="button button-outline" @click="fileInput?.click()">
                  <span aria-hidden="true">↑</span> Importar lista
                </button>
                <input
                  ref="fileInput"
                  class="visually-hidden"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  @change="handleFile"
                />
              </div>
            </div>

            <div class="filters">
              <label class="search-field">
                <span class="search-icon" aria-hidden="true">⌕</span>
                <input v-model="search" type="search" placeholder="Buscar por nombre, modelo o código..." />
              </label>
              <label class="select-wrap">
                <span class="visually-hidden">Filtrar por marca</span>
                <select v-model="brandFilter">
                  <option value="">Todas las marcas</option>
                  <option v-for="brand in brands" :key="brand" :value="brand">{{ brand }}</option>
                </select>
                <span class="select-caret">⌄</span>
              </label>
              <label class="select-wrap">
                <span class="visually-hidden">Filtrar por categoría</span>
                <select v-model="categoryFilter">
                  <option value="">Todas las categorías</option>
                  <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
                </select>
                <span class="select-caret">⌄</span>
              </label>
            </div>

            <div class="table-scroll">
              <table class="data-table catalog-table">
                <thead>
                  <tr><th>PRODUCTO</th><th>CATEGORÍA</th><th>PRECIO</th><th><span class="visually-hidden">Acción</span></th></tr>
                </thead>
                <tbody>
                  <tr v-for="product in filteredProducts" :key="product.id">
                    <td>
                      <div class="product-cell">
                        <span class="product-avatar">{{ product.name.slice(0, 1).toUpperCase() }}</span>
                        <span class="product-info">
                          <strong>{{ product.name }}</strong>
                          <small>{{ [product.brand, product.model, product.sku].filter(Boolean).join(' · ') || 'Sin marca ni modelo' }}</small>
                        </span>
                      </div>
                    </td>
                    <td><span v-if="product.category" class="category-pill">{{ product.category }}</span><span v-else class="muted">—</span></td>
                    <td class="price-cell">{{ formatCurrency(product.price) }}</td>
                    <td class="action-cell"><button class="add-button" :aria-label="`Agregar ${product.name}`" @click="addProduct(product)">+</button></td>
                  </tr>
                  <tr v-if="filteredProducts.length === 0">
                    <td colspan="4" class="empty-row">
                      <span class="empty-icon">⌕</span>
                      <strong>No encontramos productos</strong>
                      <span>Probá con otra búsqueda o cambiá los filtros.</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="catalog-footer">
              <span>Mostrando <strong>{{ filteredProducts.length }}</strong> de {{ catalog.length }} productos</span>
              <span class="sample-note"><span class="sample-dot"></span>{{ isDemoCatalog ? 'Catálogo de ejemplo · Importá tu lista para reemplazarlo' : 'Catálogo guardado en este dispositivo' }}</span>
            </div>
          </section>
          <p class="privacy-note"><span aria-hidden="true">◈</span> Tus datos se guardan en este dispositivo. No se suben a ningún servidor.</p>
        </div>

        <aside class="quote-column">
          <section class="panel quote-panel">
            <div class="quote-panel-heading">
              <div>
                <div class="section-kicker"><span class="step-number">02</span> TU PROPUESTA</div>
                <h2>Presupuesto</h2>
              </div>
              <span class="quote-badge">{{ quoteItems.length }} {{ quoteItems.length === 1 ? 'ítem' : 'ítems' }}</span>
            </div>

            <button class="client-trigger" @click="showDetails = !showDetails">
              <span class="client-icon">♙</span>
              <span class="client-trigger-copy">
                <strong>{{ client.name || 'Agregar datos del cliente' }}</strong>
                <small>{{ client.name ? 'Editar información del cliente' : 'Nombre, contacto y dirección' }}</small>
              </span>
              <span class="chevron">{{ showDetails ? '⌃' : '⌄' }}</span>
            </button>
            <div v-if="showDetails" class="details-form">
              <label>Nombre / razón social<input v-model="client.name" placeholder="Ej. Estudio Norte" /></label>
              <div class="form-row">
                <label>CUIT / DNI<input v-model="client.taxId" placeholder="30-12345678-9" /></label>
                <label>Teléfono<input v-model="client.phone" placeholder="+54 9 11..." /></label>
              </div>
              <label>Email<input v-model="client.email" type="email" placeholder="cliente@empresa.com" /></label>
              <label>Dirección<input v-model="client.address" placeholder="Calle, ciudad" /></label>
            </div>

            <div class="quote-meta">
              <label>N.º de presupuesto<input v-model="quoteNumber" /></label>
              <label>Fecha<input v-model="quoteDate" type="date" /></label>
            </div>
            <label class="margin-control">
              <span><strong>Margen sobre costo</strong><small>Se aplica al costo de cada producto</small></span>
              <span class="margin-input"><input v-model.number="marginPercent" type="number" min="0" step="0.5" aria-label="Porcentaje de margen de ganancia" @change="marginPercent = Math.max(0, Number(marginPercent) || 0)" /><span>%</span></span>
            </label>

            <div v-if="quoteProducts.length === 0" class="quote-empty">
              <div class="empty-basket"><span>＋</span></div>
              <strong>Tu presupuesto empieza acá</strong>
              <p>Agregá productos desde el catálogo para ver el detalle y calcular el total.</p>
            </div>
            <div v-else class="quote-items">
              <div class="quote-items-head"><span>DETALLE</span><span>IMPORTE</span></div>
              <div v-for="item in quoteProducts" :key="item.productId" class="quote-item">
                <div class="quote-item-main">
                  <div class="quote-item-copy">
                    <strong>{{ item.product.name }}</strong>
                      <small>Costo {{ formatCurrency(item.product.price) }} · Venta {{ formatCurrency(item.saleUnitPrice) }} / unidad</small>
                  </div>
                  <button class="remove-button" :aria-label="`Eliminar ${item.product.name}`" @click="removeProduct(item.productId)">×</button>
                </div>
                <div class="quote-item-controls">
                  <label class="quantity-control">
                    <span> Cant. </span>
                    <input v-model.number="item.quoteItem.quantity" type="number" min="1" step="1" :aria-label="`Cantidad de ${item.product.name}`" @change="updateQuantity(item.quoteItem)" />
                  </label>
                  <strong>{{ formatCurrency(item.saleAmount) }}</strong>
                </div>
              </div>
            </div>

            <div class="charges-section">
              <div class="charges-heading"><strong>Adicionales</strong><span>EDITABLES</span></div>
              <div v-for="entry in calculatedCharges" :key="entry.charge.id" class="charge-row">
                <div class="charge-description">
                  <span>{{ entry.charge.name }}</span>
                  <small>{{ chargeBaseLabel(entry.charge, entry.baseAmount) }}</small>
                  <select v-if="entry.charge.type === 'percent'" v-model="entry.charge.base" class="charge-base-select" :aria-label="`Base de cálculo de ${entry.charge.name}`">
                    <option value="products">Subtotal de productos</option>
                    <option value="accumulated">Total acumulado</option>
                    <option value="product">Un producto específico</option>
                  </select>
                  <select v-if="entry.charge.type === 'percent' && entry.charge.base === 'product'" v-model="entry.charge.productId" class="charge-base-select" :aria-label="`Producto base de ${entry.charge.name}`">
                    <option value="">Elegir producto</option>
                    <option v-for="item in quoteProducts" :key="`base-${entry.charge.id}-${item.productId}`" :value="item.productId">{{ item.product.name }}</option>
                  </select>
                  <select v-model="entry.charge.audience" class="charge-base-select audience-select" :aria-label="`Destino de ${entry.charge.name}`">
                    <option value="commercial">Al cliente</option>
                    <option value="internal">Solo interno</option>
                  </select>
                </div>
                <div class="charge-editor">
                  <select v-model="entry.charge.type" class="charge-type-select" :aria-label="`Tipo de ${entry.charge.name}`">
                    <option value="fixed">$</option>
                    <option value="percent">%</option>
                  </select>
                  <label class="charge-value">
                    <input v-model.number="entry.charge.value" type="number" min="0" step="0.01" :aria-label="`Valor de ${entry.charge.name}`" @change="entry.charge.value = Math.max(0, Number(entry.charge.value) || 0)" />
                  </label>
                  <strong>{{ formatCurrency(entry.amount) }}</strong>
                  <button v-if="!['iva', 'envio'].includes(entry.charge.id)" class="remove-charge" :aria-label="`Eliminar ${entry.charge.name}`" @click="removeCharge(entry.charge.id)">×</button>
                </div>
              </div>

              <div class="add-charge-form">
                <input v-model="newChargeName" placeholder="Nuevo concepto..." aria-label="Nombre del adicional" @keydown.enter.prevent="addCharge" />
                <select v-model="newChargeType" aria-label="Tipo de adicional">
                  <option value="fixed">Monto $</option>
                  <option value="percent">Porcentaje %</option>
                </select>
                <button class="small-add-button" :disabled="!newChargeName.trim() || (newChargeType === 'percent' && newChargeBase === 'product' && !newChargeProductId)" aria-label="Agregar adicional" @click="addCharge">+</button>
              </div>
              <label v-if="newChargeType === 'percent'" class="base-select">
                <span>Calcular sobre</span>
                <select v-model="newChargeBase">
                  <option value="products">Subtotal de productos</option>
                  <option value="accumulated">Total acumulado</option>
                  <option value="product">Un producto específico</option>
                </select>
              </label>
              <label class="base-select">
                <span>Aplicar como</span>
                <select v-model="newChargeAudience">
                  <option value="commercial">Adicional al cliente</option>
                  <option value="internal">Costo interno</option>
                </select>
              </label>
              <label v-if="newChargeType === 'percent' && newChargeBase === 'product'" class="base-select">
                <span>Producto de referencia</span>
                <select v-model="newChargeProductId">
                  <option value="">Elegir producto</option>
                  <option v-for="item in quoteProducts" :key="`new-base-${item.productId}`" :value="item.productId">{{ item.product.name }}</option>
                </select>
              </label>
              <p class="charge-hint">Los adicionales sobre el acumulado se calculan en el orden de esta lista.</p>
            </div>

            <div class="quote-totals">
              <div><span>Costo base <small>({{ totalUnits }} {{ totalUnits === 1 ? 'unidad' : 'unidades' }})</small></span><strong>{{ formatCurrency(costSubtotal) }}</strong></div>
              <div><span>Margen sobre costo ({{ marginPercent }}%)</span><strong>{{ formatCurrency(marginAmount) }}</strong></div>
              <div><span>Subtotal de venta</span><strong>{{ formatCurrency(subtotal) }}</strong></div>
              <div v-for="entry in calculatedCharges" :key="`total-${entry.charge.id}`" class="total-charge">
                <span>{{ entry.charge.name }} <small>{{ entry.charge.audience === 'internal' ? 'interno' : 'cliente' }}</small></span><strong>{{ formatCurrency(entry.amount) }}</strong>
              </div>
              <div class="internal-cost-total"><span>Costo interno total <small>base + adicionales internos</small></span><strong>{{ formatCurrency(internalCostTotal) }}</strong></div>
              <div class="grand-total"><span>Total para el cliente</span><strong>{{ formatCurrency(total) }}</strong></div>
              <div class="net-profit"><span>Ganancia neta estimada</span><strong>{{ formatCurrency(netProfit) }}</strong></div>
              <p class="currency-note">Valores expresados en pesos argentinos (ARS).</p>
            </div>
            <div class="export-buttons">
              <button class="button button-outline" :disabled="quoteItems.length === 0" @click="printQuote('internal')">Exportar interno</button>
              <button class="button button-primary" :disabled="quoteItems.length === 0" @click="printQuote('customer')"><span aria-hidden="true">↗</span> Exportar cliente</button>
            </div>
          </section>

          <section class="issuer-card">
            <div>
              <span class="issuer-icon">✳</span>
              <span><strong>Datos de tu negocio</strong><small>Personalizá quién emite el presupuesto</small></span>
            </div>
            <button class="text-button" @click="showIssuer = !showIssuer">{{ showIssuer ? 'Cerrar' : 'Editar' }}</button>
            <div v-if="showIssuer" class="issuer-form">
              <label>Empresa / emisor<input v-model="issuer.name" placeholder="Nombre de tu empresa" /></label>
              <label>CUIT / DNI<input v-model="issuer.taxId" placeholder="Identificación fiscal" /></label>
              <label>Email<input v-model="issuer.email" type="email" placeholder="hola@tuempresa.com" /></label>
              <label>Teléfono<input v-model="issuer.phone" placeholder="+54 9 11..." /></label>
              <label>Dirección<input v-model="issuer.address" placeholder="Dirección comercial" /></label>
            </div>
          </section>
        </aside>
      </section>
      <footer class="app-footer"><span>Presupuestador simple, para trabajar mejor.</span><span>Hecho para el día a día <span class="footer-heart">♥</span></span></footer>
    </main>

    <article v-if="exportMode === 'customer'" class="print-document print-customer">
      <header class="print-header">
        <div>
          <div class="print-brand">presupuestos<span>.</span></div>
          <h1>Presupuesto</h1>
          <p>N.º {{ quoteNumber }}</p>
        </div>
        <div class="print-date"><span>FECHA DE EMISIÓN</span><strong>{{ quoteDateLabel(quoteDate) }}</strong></div>
      </header>
      <div class="print-parties">
        <section><span>EMITIDO POR</span><strong>{{ issuer.name || '—' }}</strong><p v-if="issuer.taxId">CUIT / DNI: {{ issuer.taxId }}</p><p v-if="issuer.address">{{ issuer.address }}</p><p v-if="issuer.phone">{{ issuer.phone }}</p><p v-if="issuer.email">{{ issuer.email }}</p></section>
        <section><span>PREPARADO PARA</span><strong>{{ client.name || 'Cliente' }}</strong><p v-if="client.taxId">CUIT / DNI: {{ client.taxId }}</p><p v-if="client.address">{{ client.address }}</p><p v-if="client.phone">{{ client.phone }}</p><p v-if="client.email">{{ client.email }}</p></section>
      </div>
      <table class="print-table">
        <thead><tr><th>DESCRIPCIÓN</th><th>PRECIO UNITARIO</th><th>CANT.</th><th class="print-number">IMPORTE</th></tr></thead>
        <tbody>
          <tr v-for="item in quoteProducts" :key="`print-${item.productId}`">
            <td><strong>{{ item.product.name }}</strong><small>{{ [item.product.brand, item.product.model, item.product.sku].filter(Boolean).join(' · ') }}</small></td>
            <td>{{ formatCurrency(item.saleUnitPrice) }}</td><td>{{ item.quantity }}</td><td class="print-number">{{ formatCurrency(item.saleAmount) }}</td>
          </tr>
          <tr v-if="quoteProducts.length === 0"><td colspan="4">No hay productos agregados.</td></tr>
        </tbody>
      </table>
      <div class="print-summary">
        <div class="print-summary-lines"><div><span>Subtotal</span><strong>{{ formatCurrency(subtotal) }}</strong></div>
          <div v-for="entry in calculatedCharges.filter((item) => item.charge.audience === 'commercial')" :key="`print-charge-${entry.charge.id}`"><span>{{ entry.charge.name }}<small v-if="entry.charge.type === 'percent'">{{ chargeBaseLabel(entry.charge, entry.baseAmount) }}</small></span><strong>{{ formatCurrency(entry.amount) }}</strong></div>
          <div class="print-grand-total"><span>Total</span><strong>{{ formatCurrency(total) }}</strong></div>
        </div>
      </div>
      <footer class="print-footer"><strong>Gracias por tu consulta.</strong><span>Presupuesto válido sujeto a disponibilidad y confirmación.</span></footer>
    </article>
    <article v-else class="print-document print-internal">
      <header class="print-header">
        <div>
          <div class="print-brand">presupuestos<span>.</span></div>
          <h1>Presupuesto · Uso interno · Confidencial</h1>
          <p>N.º {{ quoteNumber }}</p>
        </div>
        <div class="print-date"><span>FECHA DE EMISIÓN</span><strong>{{ quoteDateLabel(quoteDate) }}</strong></div>
      </header>
      <div class="print-parties">
        <section><span>EMITIDO POR</span><strong>{{ issuer.name || '—' }}</strong><p v-if="issuer.taxId">CUIT / DNI: {{ issuer.taxId }}</p><p v-if="issuer.address">{{ issuer.address }}</p><p v-if="issuer.phone">{{ issuer.phone }}</p><p v-if="issuer.email">{{ issuer.email }}</p></section>
        <section><span>PREPARADO PARA</span><strong>{{ client.name || 'Cliente' }}</strong><p v-if="client.taxId">CUIT / DNI: {{ client.taxId }}</p><p v-if="client.address">{{ client.address }}</p><p v-if="client.phone">{{ client.phone }}</p><p v-if="client.email">{{ client.email }}</p></section>
      </div>
      <table class="print-table internal-table">
        <thead><tr><th>PRODUCTO</th><th>COSTO BASE</th><th>CANT.</th><th>MARGEN</th><th>VENTA UNIT.</th><th class="print-number">VENTA TOTAL</th></tr></thead>
        <tbody>
          <tr v-for="item in quoteProducts" :key="`internal-${item.productId}`">
            <td><strong>{{ item.product.name }}</strong><small>{{ [item.product.brand, item.product.model, item.product.sku].filter(Boolean).join(' · ') }}</small></td>
            <td>{{ formatCurrency(item.costAmount) }}<small>{{ formatCurrency(item.product.price) }} / unidad</small></td>
            <td>{{ item.quantity }}</td>
            <td>{{ marginPercent }}%<small>{{ formatCurrency(item.marginAmount) }}</small></td>
            <td>{{ formatCurrency(item.saleUnitPrice) }}</td>
            <td class="print-number">{{ formatCurrency(item.saleAmount) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="print-summary">
        <div class="print-summary-lines">
          <div><span>Costos base de productos</span><strong>{{ formatCurrency(costSubtotal) }}</strong></div>
          <div><span>Margen sobre costo base ({{ marginPercent }}%)</span><strong>{{ formatCurrency(marginAmount) }}</strong></div>
          <div><span>Costo interno total</span><strong>{{ formatCurrency(internalCostTotal) }}</strong></div>
          <div><span>Subtotal de venta</span><strong>{{ formatCurrency(subtotal) }}</strong></div>
          <div v-for="entry in calculatedCharges" :key="`internal-charge-${entry.charge.id}`">
            <span>{{ entry.charge.name }} · {{ entry.charge.audience === 'internal' ? 'Costo interno' : 'Adicional al cliente' }}<small v-if="entry.charge.type === 'percent'">{{ chargeBaseLabel(entry.charge, entry.baseAmount) }}</small></span>
            <strong>{{ formatCurrency(entry.amount) }}</strong>
          </div>
          <div class="print-grand-total"><span>Total para el cliente</span><strong>{{ formatCurrency(total) }}</strong></div>
          <div class="print-net-profit"><span>Ganancia neta estimada</span><strong>{{ formatCurrency(netProfit) }}</strong></div>
        </div>
      </div>
      <footer class="print-footer"><strong>Documento interno · No entregar al cliente</strong><span>La ganancia neta estimada descuenta los costos adicionales internos y excluye impuestos.</span></footer>
    </article>
  </div>
</template>
