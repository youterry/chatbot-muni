import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import re
from dotenv import load_dotenv

try:
    from pdfminer.high_level import extract_text
    PDF_MINER_AVAILABLE = True
except ImportError:
    print("Advertencia: 'pdfminer.six' no está instalado. Si se cargaran PDFs dinámicamente, no se podrían procesar.")
    PDF_MINER_AVAILABLE = False

load_dotenv()

app = Flask(__name__)
CORS(app)

GOOGLE_API_KEY = os.getenv('GEMINI_API_KEY')
genai.configure(api_key=GOOGLE_API_KEY)

model = genai.GenerativeModel('models/gemini-1.5-flash')

# --- Contenido de los documentos precargados ---
PRELOADED_DOC_CONTENTS = {}

def load_preloaded_documents():
    """Carga los contenidos de los documentos especificados al iniciar la aplicación."""
    documents_to_load = {
        "Procedimiento_Administrativo_Separacion_Divorcio.txt": "separacion_divorcio",
        "Procedimiento_Administrativo_Acceso_Informacion_Publica.txt": "acceso_informacion"
    }

    for filename, doc_key in documents_to_load.items():
        # Asume que los TXT están en la misma carpeta que app.py
        filepath = os.path.join(os.path.dirname(__file__), filename)
        if not os.path.exists(filepath):
            print(f"Advertencia: El archivo '{filename}' no se encontró en '{filepath}'. No se precargará su contenido.")
            continue

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                # Limitar el tamaño para el modelo (aprox. 30,000 caracteres como un buen límite)
                if len(content) > 30000:
                    content = content[:30000] + "\n... (contenido truncado por longitud para el modelo)"
                PRELOADED_DOC_CONTENTS[doc_key] = content
                print(f"Documento '{filename}' cargado exitosamente.")
        except Exception as e:
            print(f"Error al cargar el documento '{filename}': {e}")

# Llama a la función de carga de documentos cuando la aplicación se inicia
with app.app_context():
    load_preloaded_documents()
# --- Fin de Contenido de los documentos precargados ---


# Define el system_instruction para tu asistente Municipal
system_instruction_municipal = (
    "Eres un asistente virtual especializado en trámites Municipales de la Municipalidad Provincial de Puno. "
    "Tu función es proporcionar información clara y concisa sobre los procedimientos administrativos. "
    "Responde a las preguntas de los usuarios de manera servicial y profesional, utilizando **exclusivamente** la información que te ha sido proporcionada en el contexto de la conversación (incluyendo los documentos precargados que te he suministrado). "
    "Si el usuario pregunta sobre un trámite de divorcio o separación (por ejemplo, 'quiero divorciarme', 'necesito saber sobre divorcio'), proporciona directamente la **información completa y detallada del procedimiento 'Solicitud para el Procedimiento no Contencioso de Separación Convencional y Divorcio Ulterior' tal como aparece en el documento precargado**, incluyendo: "
    "   - El título completo del procedimiento."
    "   - El código."
    "   - La descripción."
    "   - Todos los requisitos enumerados."
    "   - Las notas relevantes."
    "   - Los canales de atención."
    "   - El pago por derecho de tramitación."
    "   - Las modalidades de pago."
    "Asegúrate de mantener el formato original (saltos de línea obligatorio a cada subtitulo al menos 2 lineas, numeración, etc.) para que sea fácil de leer. "
    "Siempre inicia tus respuestas diciendo 'Asistente Municipal de Puno:'. "
    "Si la pregunta no está relacionada con la información que posees o no puedes inferirla directamente de los documentos, indícalo amablemente diciendo que no tienes información al respecto. "
    "No intentes realizar diagnósticos médicos ni dar consejos que no estén directamente relacionados con los trámites Municipales que conoces."
)

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message')
    chat_history = data.get('chat_history', [])

    if not user_message:
        return jsonify({"error": "No se proporcionó ningún mensaje"}), 400

    # Construir el historial para Gemini
    gemini_history = []

    # 1. La instrucción del sistema como el primer mensaje del rol 'user'
    gemini_history.append({"role": 'user', "parts": system_instruction_municipal}) # Cuidado: el rol 'user' para system_instruction es un patrón común, pero Gemini-1.5 a veces prefiere 'system'. Sin embargo, para 1.5-flash y la forma de usar history, 'user' es el que mejor se integra aquí.

    # 2. Inyectar el contenido de los documentos precargados al inicio de la conversación
    for doc_key, content in PRELOADED_DOC_CONTENTS.items():
        if doc_key == "separacion_divorcio":
            gemini_history.append({"role": 'user', "parts": [
                "Aquí está la información sobre el Procedimiento de Separación Convencional y Divorcio Ulterior:",
                content,
                "--- Fin de la información de Separación/Divorcio ---"
            ]})
        elif doc_key == "acceso_informacion":
            gemini_history.append({"role": 'user', "parts": [
                "Aquí está la información sobre el Procedimiento de Acceso a la Información Pública:",
                content,
                "--- Fin de la información de Acceso a la Información ---"
            ]})

    # 3. Añadir el historial de chat previo (solo user y model messages)
    for entry in chat_history:
        role = 'user' if entry['sender'] == 'user' else 'model'
        msg_content = entry['message']
        gemini_history.append({"role": role, "parts": msg_content})

    convo = model.start_chat(history=gemini_history)

    try:
        response_gemini = convo.send_message(user_message, generation_config=genai.GenerationConfig(temperature=0.1))
        bot_raw_text = response_gemini.text.strip()

        response_message = bot_raw_text
        response_options = [] # Mantener vacío si no se esperan opciones estructuradas

        # Asegúrate de que el prefijo "Asistente Municipal de Puno:" esté presente
        if not response_message.lower().startswith('asistente municipal de puno:'):
            response_message = 'Asistente Municipal de Puno: ' + response_message

        return jsonify({
            "message": response_message.strip(),
            "options": response_options
        })

    except Exception as e:
        print(f"Error al interactuar con Gemini: {e}")
        if "Blocked by safety settings" in str(e):
            return jsonify({"error": "Respuesta bloqueada por seguridad. Intente reformular su pregunta."}), 500
        return jsonify({"error": "Error procesando la solicitud. Por favor, intente de nuevo más tarde."}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)