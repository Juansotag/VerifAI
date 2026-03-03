# Fact-Check Vivo

> Extensión de Chrome para verificación de hechos en tiempo real sobre videos de YouTube.  
> Desarrollada por el **GovLab** de la **Universidad de la Sabana** — Juan Sotelo Aguilar.

---

## ¿Qué hace?

**Fact-Check Vivo** combina transcripción automática, corrección con IA y verificación de declaraciones en tiempo real en una sola extensión de navegador. Pensada para periodistas, investigadores y analistas de discurso político.

El flujo completo:

```
Video de YouTube → Guión (CC o Whisper) → Corrección con GPT → Extracción de declaraciones → Verificación con Gemini + Google Search
```

---

## Funcionalidades

### 📄 Pestaña Subtítulos CC
- Captura los subtítulos cerrados (CC) del video en tiempo real mientras se reproduce.
- Permite editar el texto manualmente.
- Corrige errores ortográficos y de transcripción con GPT-4o mini.

### 🎙️ Pestaña Whisper
- Captura el audio de la pestaña activa y lo transcribe con el modelo **Whisper** de OpenAI.
- Configurable: intervalo de envío entre 3 y 20 segundos.
- También incluye corrección con IA.

### 🛡️ Pestaña Fact-Check
- **Auto-llenado de contexto**: extrae título, canal y descripción del video automáticamente.
- **Extracción incremental**: cada búsqueda procesa solo el texto nuevo desde la última vez; las declaraciones se acumulan.
- **Verificación individual o masiva**: verifica una declaración o todas en secuencia con un solo clic.
- **5 veredictos posibles**:
  | Veredicto | Descripción |
  |---|---|
  | ✓ Verdadera | Confirmada por fuentes |
  | ◐ Mayormente cierta | Correcta con matices |
  | ◑ Mayormente falsa | Incorrecta en lo esencial |
  | ✕ Falsa | Refutada por fuentes |
  | ? No determinada | Imposible verificar |
- **Fuentes reales**: muestra los links de las páginas usadas por Gemini para verificar (grounding metadata).
- **Edición de declaraciones**: el texto de cada declaración es editable antes de verificar.
- **Eliminar declaraciones** individualmente.

---

## Requisitos

| Requisito | Detalle |
|---|---|
| Navegador | Google Chrome (Manifest V3) |
| API Key OpenAI | Para Whisper y corrección de guión. [Obtener →](https://platform.openai.com/api-keys) |
| API Key Gemini | Para verificación con Google Search en tiempo real. **Gratuita.** [Obtener →](https://aistudio.google.com/apikey) |

> Si no se configura la API Key de Gemini, la verificación usa GPT-4o con datos hasta 2024 (sin búsqueda web).

---

## Instalación

1. Clona o descarga este repositorio.
2. Abre Chrome y ve a `chrome://extensions/`.
3. Activa el **Modo de desarrollador** (esquina superior derecha).
4. Haz clic en **"Cargar extensión sin empaquetar"** y selecciona la carpeta del proyecto.
5. La extensión aparecerá en la barra de Chrome con el ícono de Fact-Check Vivo.
6. Abre cualquier video de YouTube, haz clic en el ícono y se abrirá el panel lateral.

---

## Configuración

Haz clic en el ícono ⚙ en la esquina superior derecha del panel:

- **API Key de OpenAI**: necesaria para Whisper y corrección de guión.
- **API Key de Gemini**: necesaria para verificación con Google Search en tiempo real.
- **Idioma**: idioma de transcripción para Whisper.
- **Intervalo Whisper**: cada cuántos segundos se envía audio a Whisper (3–20 s).

---

## Estructura del proyecto

```
fact-check-vivo/
├── manifest.json        # Configuración de la extensión (Manifest V3)
├── background.js        # Service worker — gestión de captura de audio
├── content.js           # Script inyectado en YouTube — captura de subtítulos CC
├── sidepanel.html       # Interfaz principal del panel lateral
├── sidepanel.css        # Estilos (tema claro, azul navy)
├── sidepanel.js         # Lógica completa de la extensión
└── icons/
    ├── icon.png         # Ícono de la aplicación
    ├── Govlab.png       # Logo GovLab
    └── Universidad de la Sabana.png
```

---

## APIs utilizadas

| API | Uso |
|---|---|
| `OpenAI Whisper` | Transcripción de audio |
| `OpenAI GPT-4o mini` | Corrección de guión y extracción de declaraciones |
| `OpenAI GPT-4o` | Verificación de declaraciones (fallback sin Gemini) |
| `Google Gemini 2.5 Flash` | Verificación con Google Search grounding en tiempo real |
| `Chrome Extensions API` | `tabCapture`, `sidePanel`, `scripting`, `storage` |

---

## Créditos

Desarrollado por **Juan Sotelo Aguilar**  
[GovLab](https://www.unisabana.edu.co/) — Universidad de la Sabana  

---

## Licencia

Este proyecto es de uso académico e investigativo. Para usos comerciales, contactar al GovLab de la Universidad de la Sabana.
