

# Logicflow

Logicflow es un entorno de programación visual en tiempo real, basado en bloques, diseñado alrededor de la transformación de datos mediante operaciones encadenadas.

Proporciona un editor de estructuras para crear lógica de programación encadenando operaciones, con ejecución en tiempo real, generación de código y despliegue con un solo clic.

Mira el [video de demostración](https://youtu.be/qzS_zw1iwS0) para obtener un panorama general.

Consulta la [documentación](https://logicflow.dev/docs) para más detalles.

## Características Principales

### Editor Principal

- **Modelo mental simple**: La programación consiste en operaciones encadenadas después de los datos, sin syntax adicional que aprender.
- **Editor de estructuras basado en bloques**: Crea lógica encadenando operaciones sobre datos en un formato lineal similar al texto, con interacción basada en teclado y sin necesidad de arrastrar y soltar.
- **Ejecución en tiempo real**: Observa los resultados de la ejecución en cada paso mientras construyes. Rastrea cómo se transforman los datos a través de cadenas de operaciones mediante ejecución en Web Workers fuera del hilo principal.
- **Seguimiento de ejecución omitida**: Indicadores visuales para código inalcanzable en operaciones condicionales mediante estrechamiento de tipos (type narrowing).
- **Deshacer/Rehacer**: Seguimiento de historial por archivo (hasta 50 niveles) con Deshacer (`Cmd/Ctrl+Z`) y Rehacer (`Cmd/Ctrl+Shift+Z`).
- **Puntos de control del proyecto**: Control de versiones basado en instantáneas: crea, restaura y elimina puntos de control con nombre en cualquier momento.

### Operaciones y Paquetes

Logicflow se entrega con un conjunto completo de operaciones integradas e integraciones de paquetes opcionales:

- **Integraciones impulsadas por Remeda** (`map`, `filter`, `sort`, `groupBy`, `reduce`, `pick`, `omit`, y muchos más) — utilidades de transformación de datos funcionales.
- **Integraciones impulsadas por Immer** (`set`, `setPath`, `addProp`, `swapProps`, `evolve`, y helpers relacionados) — actualizaciones de estado inmutables con una API mutable.
- **Wretch** (`url`, `get`, `post`, `headers`, `json`, `body`, `res`) — cliente HTTP seguro por tipos como operaciones encadenables.
- **Rowguard** (`column`, `policy`, `from`, `auth.uid`, `session.get`, `policies.userOwned`) — constructor de políticas de Seguridad a Nivel de Fila (RLS) para Supabase.
- **Faker** (261 operaciones en 28 espacios de nombres: `person`, `string`, `number`, `date`, `location`, etc.) — generación de datos falsos.
- **date-fns** (243 operaciones: `format`, `addDays`, `differenceInDays`, `isBefore`, etc.) — manipulación de fechas.
- **Supabase** (`createClient`, `from`, `select`, `insert`, `update`, `eq`, `order`, `functions.invoke`) — consultas a bases de datos y llamadas a Edge Functions.
- **SDK de ComfyUI** (`ComfyApi`, `ComfyPool`, `PromptBuilder`, `CallWrapper`, `WorkflowBuilder`) — operaciones de cliente para flujos de trabajo de imágenes en un servidor ComfyUI.
- **FFmpeg** (paquete virtual, sin dependencia de npm) — constructor de comandos FFmpeg con operaciones como `input`, `output`, `videoCodec`, `audioCodec`, `format`, `resolution`, `frameRate`, y más.

Los paquetes opcionales se pueden habilitar o deshabilitar por proyecto y asignarles alias o espacios de nombres personalizados.

### Generación de Código

- **Operaciones visuales a TypeScript/JavaScript**: Cada programa genera código limpio y legible utilizando los patrones funcionales integrados `pipe()`/`pipeAsync()`.
- **Mapeo de origen de operaciones**: Mapea correctamente las operaciones integradas, de paquetes, métodos de instancia y operaciones definidas por el usuario a sus equivalentes en código.
- **Salida formateada con Prettier**: El código generado se formatea automáticamente.

### Despliegue

- **Despliegue con un solo clic** en **Vercel** (Edge Functions + respaldo de Node.js) y **Supabase** (Edge Functions).
- **Disparadores HTTP**: Convierte cualquier operación en un endpoint de API con métodos HTTP configurables, configuraciones CORS y variables de entorno.
- **Historial de despliegues**: Rastrea todos los despliegues por proyecto con estado, marcas de tiempo y URLs de despliegue.
- **Generación de configuración de plataforma**: Genera automáticamente `vercel.json`, `package.json` y envolturas de punto de entrada.

### Sistema de Tipos

- **Tipos primitivos**: `string`, `number`, `boolean`, `undefined`.
- **Tipos complejos**: `array`, `tuple`, `object` y `dictionary` con propiedades anidadas.
- **Tipos especiales**: `operation`, `condition`, `union` (múltiples opciones de tipo), `error` (con cuatro variantes de error), `reference` (variables), `instance` (Date, URL, Promise, etc.), `unknown` y `never`.
- **Inferencia de tipos**: Inferencia automática de tipos a partir de valores de datos y operaciones.
- **Verificación de compatibilidad de tipos**: Comparación estructural profunda de tipos.
- **Estrechamiento de tipos (Type narrowing)**: Refinamiento de tipos sensible al contexto que omite automáticamente ramas inalcanzables.

### Manejo de Errores

- **Errores como datos de primera clase**: Las entidades de error pueden pasarse y manejarse como cualquier otro dato.
- **Tipos de error**: `runtime_error`, `type_error`, `reference_error` y `custom_error` (definidos por el usuario).
- **Propagación de errores**: Los errores se propagan a través de las cadenas de operaciones automáticamente.
- **Límites de error (Error boundaries)**: Los límites de error de React aíslan los fallos de renderizado a entidades individuales.

### Gestión de Proyectos y Persistencia

- **Panel principal (Dashboard)**: Crea, abre y elimina proyectos desde una vista de lista de proyectos.
- **Persistencia con IndexedDB**: Todos los datos del proyecto (archivos, operaciones, configuraciones y puntos de control) se almacenan localmente a través de IndexedDB.
- **Configuraciones por proyecto**: Gestión de paquetes, preferencias de diseño y configuración de despliegue.
- **Visor de documentación integrado**: Documentación basada en Markdown accesible desde dentro de la aplicación en `/docs`.
- **Diseño responsivo**: Interfaz de usuario adaptable con soporte para móviles y un interruptor para el ajuste de líneas.

### Navegación por Teclado

- **Teclas de flecha**: Navega entre sentencias y operaciones.
- **Cmd/Ctrl + Teclas de flecha**: Salta a los límites de una sentencia u operación.
- **Alt + Teclas de flecha**: Recorre operaciones dentro de una sentencia.
- **Backspace / Alt + Backspace**: Elimina el elemento con enfoque.
- **Escape**: Cierra los menús desplegables y el panel de detalles.
- **Ctrl + Espacio**: Abre el menú desplegable de operaciones.
- **Alt + =**: Agrega una llamada a una operación.
- **Ctrl + Shift + 1/2/3/4**: Cambia entre pestañas de la barra lateral.

### Funciones de la Interfaz

- **Resaltado de sintaxis**: Tipos, variables, métodos, cadenas y números codificados por colores mediante prism-react-renderer.
- **Menús desplegables buscables**: Menús desplegables filtrados por tipo y buscables para tipos de datos y operaciones.
- **Panel de detalles**: Panel lateral que muestra información de tipo y resultados de ejecución con la capacidad de bloquear/fijar en una entidad específica.
- **Barra lateral con pestañas**: Lista de operaciones, Detalles, Despliegue y Configuración.
- **Paneles redimensionables**: Arrastra para cambiar el tamaño de los paneles de la barra lateral y de detalles.

## Para Empezar

### Requisitos Previos

- Node.js (v18 o posterior)
- Yarn (gestor de paquetes)

### Instalación

```bash
# Clone the repository
git clone https://github.com/your-org/logicflow.git
cd logicflow

# Install dependencies
yarn install

# Copy environment variables
cp .env.example .env.local
```

### Desarrollo

```bash
# Start the dev server (opens at http://localhost:3000)
yarn dev

# Run tests
yarn test

# Run tests with coverage
yarn test --coverage

# Build for production
yarn build

# Preview production build
yarn preview
```

### Variables de Entorno

| Variable             | Descripción                                         |
| -------------------- | --------------------------------------------------- |
| `VITE_API_PROXY_URL` | URL de proxy solo para solicitudes de API de la plataforma de despliegue |

## Stack Tecnológico

- **Interfaz (UI)**: React 18, Mantine, Tailwind CSS v4.
- **Estado**: Zustand con actualizaciones inmutables de Immer y persistencia en IndexedDB.
- **Ejecución**: Web Workers para ejecución en tiempo real fuera del hilo principal.
- **Validación**: Esquemas de Zod para seguridad de tipos en tiempo de ejecución.
- **Enrutamiento**: React Router v7.
- **Pruebas**: Vitest con jsdom y @testing-library/react.
- **Compilación**: Vite 6 con TypeScript.

## Licencia

[Licencia AGPL v3.0](LICENSE)
