# VerifAI

> Extensión de Chrome para verificación de hechos y análisis de discurso forense en tiempo real sobre videos de YouTube.
> Desarrollada por el **GovLab** de la **Universidad de la Sabana** — Juan Sotelo Aguilar.

---

## 📌 ¿Qué es VerifAI?

**VerifAI** es una potente herramienta de código abierto diseñada para mitigar el impacto de la desinformación en procesos electorales y debates públicos. Su objetivo principal es identificar, evaluar y validar en tiempo real las afirmaciones empíricas en los discursos de los candidatos políticos a partir de la evidencia.

Integrando inteligencia artificial avanzada de OpenAI y Google (Gemini), la extensión captura las transcripciones de videos y directos de YouTube —ya sea mediante *Close Captions* (CC) nativos o reconocimiento de voz en la nube (Whisper)— transformando el habla en texto limpio, fácil de leer y analizable. 

El usuario puede desarrollar distintas acciones interactuando con este texto, dividiendo el poder de la herramienta en tres frentes fundamentales:
1. **Corrección de IA en vivo:** Limpia el discurso bruto para facilitar la lectura, eliminando muletillas e incoherencias propias de la oralidad.
2. **Fact-Checking en tiempo real:** Identifica automáticamente declaraciones comprobables en el guion y permite editarlas y verificarlas instantáneamente contrastándolas con fuentes empíricas.
3. **Análisis de Discurso Profundo:** Evalúa el tono y las emociones dominantes, palabras clave, detección de falacias, y establece el encuadre (*framing*) utilizado por el político.

El flujo completo:

```
Video de YouTube → Guión (CC o Whisper) → Corrección con GPT → Extracción de declaraciones → Verificación con Gemini + Google Search / Análisis de discurso (GPT)
```

---

## Funcionalidades Prácticas

### 📄 Pestaña Subtítulos CC
- Captura los subtítulos cerrados (CC) del video en tiempo real mientras se reproduce.
- Permite editar el texto manualmente.
- Corrige errores ortográficos y de transcripción con GPT-4o mini, de forma incremental o manual.

### 🎙️ Pestaña Whisper
- Captura el audio de la pestaña activa y lo transcribe con el modelo **Whisper** de OpenAI.
- Configurable: intervalo de recolección de audio y envío.
- También incluye corrección con IA para facilitar una lectura corrida de discursos en vivo.

### 🛡️ Pestaña Fact-Check
- **Auto-llenado de contexto**: extrae automáticamente el título, el creador del canal y la descripción de YouTube.
- **Extracción incremental e inteligente**: cada búsqueda extrae cualquier frase cualitativa, acusación o estadística y procesa solo el texto nuevo acumulado. Límite de extracciones configurable (1-25).
- **Verificación en bloque o auto-verificación**: evalúa múltiples sentencias simultáneamente e incluso se puede automatizar en vivo.
- **5 veredictos posibles**:
  | Veredicto | Descripción |
  |---|---|
  | ✓ Verdadera | Confirmada por fuentes |
  | ◐ Mayormente cierta | Correcta con matices |
  | ◑ Mayormente falsa | Incorrecta en lo esencial |
  | ✕ Falsa | Refutada por fuentes |
  | ? Desconocido | Imposible verificar |
- **Fuentes reales**: muestra los links de las páginas extraídas por Gemini (Búsqueda en Google) para respaldar la verificación con enlaces directos (`grounding metadata`).
- **Edición manual**: las declaraciones se pueden modificar o construir desde cero (con el botón `+`).

### 🗣️ Pestaña de Discurso (Análisis Forense)
- **Carga de Contexto Absoluto**: Escanea textos gigantes para evaluarlos técnica, retórica y emocionalmente con GPT-4o.
- Identifica y cita evidencias del tono principal empujado por el hablante.
- Determina Emociones Dominantes mediante cita literal exhaustiva.
- Localiza **falacias argumentales** explicando las dislocaciones del debate.
- Genera detectores de **polarización**, encuadres políticos y uso de léxico despectivo.

---

## 🧠 Arquitectura Técnica y Flujo de Datos

La aplicación sigue una arquitectura distribuida típica de las extensiones modernas de Chrome (Manifest V3), separando las responsabilidades de captura, procesamiento en segundo plano y renderizado de la interfaz.

### 1. Extracción y Manejo del Texto Bruto (CC vs Whisper)

La herramienta maneja el texto entrante a través de dos canales paralelos y completamente independientes. Cada canal tiene sus propios mecanismos de estabilización de estado y prevención de duplicados.

#### A. Canal de Close Captions (CC) - `content.js`
Este método inyecta un script directamente en el DOM de la página de YouTube.
- **Mecanismo:** Utiliza un sondeo (polling) de alta frecuencia (`setInterval`) para identificar el contenedor de los subtítulos nativos de YouTube (`.ytp-caption-segment`).
- **Manejo de Texto:** 
  - La herramienta extrae el contenido de texto en tiempo real. 
  - Para evitar duplicados (puesto que YouTube re-renderiza los subtítulos constantemente mientras el usuario habla), el script mantiene en memoria un búfer dinámico (`lastSubtitle`). Sólo si el texto entrante es sustancialmente distinto o se añade contenido nuevo, se despacha un mensaje al `sidepanel.js` a través del sistema de mensajería nativo (`chrome.runtime.sendMessage`).
- **Ventajas:** Extremadamente rápido, cero consumo de ancho de banda o costo de API, funciona perfectamente para videos pregrabados que ya cuentan con transcripción.

#### B. Canal de Audio Nativo (Whisper API) - `background.js`
Este método opera a nivel de pestaña, capturando el flujo de audio puro. Es ideal para transmisiones en vivo, directos, o videos sin CC.
- **Mecanismo:** Emplea la API `chrome.tabCapture.capture` (disponible sólo en Service Workers o scripts de extensión privilegiados) para intervenir la salida de audio.
- **Flujo de Audio:**
  1. El stream de audio capturado se conecta a un `MediaRecorder` configurado para empaquetar los datos en fragmentos formato `webm`.
  2. Un temporizador cíclico segmenta la grabación en trozos.
  3. Al cumplirse cada intervalo, el fragmento resultante se convierte a un `Blob` luego a `File`.
  4. El archivo binario se envía vía HTTP POST (multipart) a la ruta `audio/transcriptions` de OpenAI con el modelo **whisper-1**.
  5. El retorno textual se despacha al `sidepanel.js` para renderizar secuencialmente en vivo.

### 2. Capa de Corrección Intermedia (IA Text Smoothing)
- **Procesamiento Incremental:** El `sidepanel.js` no reenvía todo el guion repetidamente. Desplaza un puntero dinámico (`lastCorrectedRawPos`) recordando cuántos caracteres del "texto bruto" ya fueron saneados en el envío de corrección anterior.
- **Limpieza (Chunking):** En cada ciclo (manual o automático), solo extrae un vector diferencial (`newText`).
- **Inferencia (GPT-4o-mini):** Envía este *chunk* a OpenAI con un *Prompt* destinado a la profilaxis gramatical. Se recibe estructurado en formato estricto JSON `{"text": "texto limpio"}`.

### 3. Motor de Fact-Checking (Extracción y Grounding)
- **Módulo de Extracción de Sentencias:** También de lectura iterativa (por puntero `lastScannedPos`), manda fragmentos brutos o corregidos a **GPT-4o-mini**. Un prompt holístico descarta saludos para aislar opiniones agresivas y aseveraciones factuales determinantes.
- **Búsqueda Dinámica (Gemini 2.5 Flash):** El esquema enlista declaraciones en la interfaz DOM permitiendo ediciones humanas. Al despacharlas a verificación, el programa empaqueta silenciosamente el *Metadata* del video (Nombre y Contexto) dándole perspectiva vital para desambiguar aseveraciones imprecisas (Ej: "Este gobierno").
- **Metadatos e Inserciones de Google:** Gemini rastrea internet y contesta con evidencia estructurada y punteros web. VerifAI filtra el campo nativo de Google llamado `groundingMetadata.groundingChunks` vinculando la procedencia explícita en tarjetas visuales de referenciación.

### 4. Motor Forense Analítico 
Analiza la estructura discursiva usando **GPT-4o** con el protocolo estricto JSON object paramétrico, categorizando el Tono, las Falacias (ej: Hombre de Paja), los Eufemismos y la dinámica Nosotros contra Ellos (Polarización y Encuadre), solicitando siempre el acompañamiento de las **evidencias textuales** extraídas de la carga enviada.

---

## 🛠 Requisitos

| Requisito | Detalle |
|---|---|
| Navegador | Google Chrome (Manifest V3) |
| API Key OpenAI | Para Whisper, extracciones, correcciones y forense GPT-4o. [Obtener →](https://platform.openai.com/api-keys) |
| API Key Gemini | Para Fact-checking + Búsqueda nativa en tiempo real de Google. **Gratuita en su tier normal.** [Obtener →](https://aistudio.google.com/apikey) |

> *Nota rápida:* Si falta la API de Gemini, el verificador recurre silenciosamente al modelo nativo GPT-4o usando su barrera de contexto local hasta su corte histórico en internet.

---

## Instalación

1. Clona o descarga este repositorio (como archivo .zip y extráelo).
2. Abre Chrome y ve a `chrome://extensions/`.
3. Activa el **Modo de desarrollador** (esquina superior derecha).
4. Haz clic en **"Cargar extensión sin empaquetar"** y selecciona la carpeta del proyecto.
5. La extensión aparecerá en la barra de extensiones. Puedes fijarla y presionar el ícono cuando tengas un video de YouTube abierto.

---

## Configuración ⚙️

Haz clic en el ícono del engranaje en la esquina superior derecha del panel y establece:
- **Tus llaves:** OpenAI y Gemini Keys (se resguardan localmente de forma segura).
- **Límites Dinámicos:** Configura el número de declaraciones simultáneas (ej. 8 por solicitud).
- **Idioma y Lapsos:** Selecciona el intervalo para capturar audios a Whisper (3-60 segs) y cada cuánto el sistema dispara correcciones gramaticales.

---

## Estructura del repositorio para Devs

```
fact-check-vivo/
├── manifest.json        # Permisos nativos (tabs, scripting, tabCapture, activeTab, storage).
├── background.js        # Service worker — orquestación de sockets Chrome API para grabaciones de Audio MediaRecorder.
├── content.js           # Lightweight scraper inyectado al iframe de YouTube para polling de CC.
├── sidepanel.html       # Interfaz gráfica principal (SVG + HTML) - Multi Tab logic.
├── sidepanel.css        # Diseño atómico del panel (Esquemas oscuros de contraste profesional).
├── sidepanel.js         # Toda la carga lógica (EventListeners, Fetch handlers para IA interconectadas).
└── icons/               # Assets estáticos (íconos, y logomarcas)
```

---

## APIs utilizadas

| Servicio IA y de Motor | Utilidad |
|---|---|
| `OpenAI Whisper (whisper-1)` | Transcripción base de secuencias sonoras en bruto. |
| `OpenAI GPT-4o mini` | Extracción inteligente de entidades y limpiador/profiláctico de guiones. |
| `OpenAI GPT-4o` | Forense completo de discursos, detección de falacias y respaldo del Fact-checker (fallback). |
| `Google Gemini 2.5 Flash` | Fact-checker en línea por defaut: motoriza conexiones con *Grounding Tool* a internet nativa Google. |
| `Chrome API` | Eje central: `tabCapture`, `scripting`, `sidePanel`, y base `storage`. |

---

## Créditos

Desarrollado y estructurado por **Juan Sotelo Aguilar**  
[GovLab](https://www.unisabana.edu.co/) — Universidad de la Sabana  

---

## Licencia

[![CC BY-NC 4.0](https://licensebuttons.net/l/by-nc/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc/4.0/)

Este material de código integrado se encuentra licenciado de forma permisiva pero acotada bajo un esquema **Creative Commons Atribución-NoComercial 4.0 Internacional (CC BY-NC 4.0)**.
- ✅ Eres libre de usar, copiar, adaptar y construir sobre esta herramienta orientada a educación y analítica.
- ✅ Todo subproducto deberá entregar una atribución directa a la universidad matriz (**Juan Sotelo / GovLab Unisabana**).
- ❌ **Uso Comercial Restringido:** No puedes comercializar el software ni emplearlo como motor facturado para terceros en ambientes privados financieros. Toda transaccionalidad exige licencias con la administración universitaria.

Para licencias comerciales contactar a: [GovLab Universidad de la Sabana](https://www.unisabana.edu.co/)  
Ver texto completo extendido en `LICENSE`.
