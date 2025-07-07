document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const welcomeMessageElement = document.querySelector('.welcome-message');
    const welcomeButtons = document.querySelectorAll('.welcome-button');

    const fileInput = document.getElementById('fileInput');
    const uploadButton = document.getElementById('uploadButton');

    let conversationHistory = [];
    let uploadedFileContent = null; // Variable para almacenar el contenido del archivo subido

    function setInputState(disabled) {
        userInput.disabled = disabled;
        sendButton.disabled = disabled;
        uploadButton.disabled = disabled;
        if (disabled) {
            userInput.placeholder = "Seleccione una opción o espere al Asistente Municipal...";
        } else {
            userInput.placeholder = "Describa su necesidad o escriba su pregunta...";
        }
    }

    setInputState(true);

    welcomeButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            let messageToSend = '';

            if (welcomeMessageElement) {
                welcomeMessageElement.remove();
                conversationHistory.push({ sender: 'chatbot', message: "¡Hola! Soy el Asistente Municipal Virtual de la Municipalidad Provincial de Puno. Estoy aquí para ayudarle con información sobre trámites administrativos." });
            }

            setInputState(false);
            userInput.focus();

            if (action === 'terminos') {
                alert("Simulación: Aquí irían los términos de uso. Por favor, inicie su consulta cuando esté listo.");
                addMessageToChat('user', "He revisado los términos de uso.");
                return;
            } else if (action === 'privacidad') {
                alert("Simulación: Aquí iría la política de privacidad. Por favor, inicie su consulta cuando esté listo.");
                addMessageToChat('user', "He revisado la política de privacidad.");
                return;
            } else if (action === 'iniciar-consulta') {
                messageToSend = "Estoy listo para iniciar la consulta.";
            }

            if (messageToSend) {
                addMessageToChat('user', messageToSend);
                await sendMessage(messageToSend);
            }
        });
    });

    sendButton.addEventListener('click', () => {
        if (!sendButton.disabled) {
            sendMessage();
        }
    });

    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !userInput.disabled) {
            sendMessage();
        }
    });

    // --- Lógica para la subida de archivos ---
    uploadButton.addEventListener('click', () => {
        if (!uploadButton.disabled) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            addMessageToChat('user', `Subiendo archivo: ${file.name}...`);
            setInputState(true);

            const formData = new FormData();
            formData.append('document', file);

            try {
                const response = await fetch('http://127.0.0.1:5000/upload_document', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error(`Error al subir el archivo: ${response.statusText}`);
                }

                const data = await response.json();
                
                // Almacenar el contenido del archivo para futuras interacciones
                uploadedFileContent = data.file_content; 

                addMessageToChat('chatbot', `Asistente Municipal de Puno: ${data.message}`);
                addMessageToChat('chatbot', 'Asistente Municipal de Puno: He procesado el documento. Ahora puedo usar su contenido para responder a sus preguntas. ¿En qué más puedo ayudarle con trámites Municipales?');
                setInputState(false);
                userInput.focus();

            } catch (error) {
                console.error('Error al subir el archivo:', error);
                addMessageToChat('chatbot', 'Asistente Municipal de Puno: Lo siento, hubo un error al subir el archivo o procesar su contenido. Por favor, intente de nuevo.');
                setInputState(false);
            }
        }
    });
    // --- Fin de lógica para la subida de archivos ---


    function addMessageToChat(sender, message, options = []) {
        const messageBubble = document.createElement('div');
        messageBubble.classList.add('message-bubble');
        if (sender === 'user') {
            messageBubble.classList.add('user-message');
        } else {
            messageBubble.classList.add('chatbot-message');
        }
        messageBubble.innerHTML = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        chatWindow.appendChild(messageBubble);

        if (options && options.length > 0) {
            const optionsContainer = document.createElement('div');
            optionsContainer.classList.add('options-container');
            options.forEach(optionText => {
                const button = document.createElement('button');
                button.classList.add('option-button');
                button.textContent = optionText;
                button.addEventListener('click', () => handleOptionClick(optionText, optionsContainer));
                optionsContainer.appendChild(button);
            });
            chatWindow.appendChild(optionsContainer);
            setInputState(true);
        } else {
            setInputState(false);
        }
        
        // Solo el mensaje del usuario y la respuesta del bot van al historial para Gemini
        if (sender === 'user' || sender === 'chatbot') {
            conversationHistory.push({ sender: sender, message: message, options: options });
        }
        
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    async function handleOptionClick(selectedOption, optionsContainer) {
        Array.from(optionsContainer.children).forEach(button => button.disabled = true);
        optionsContainer.classList.add('options-selected');

        addMessageToChat('user', selectedOption);

        setInputState(true);

        const thinkingBubble = document.createElement('div');
        thinkingBubble.classList.add('message-bubble', 'chatbot-message', 'thinking-message');
        thinkingBubble.textContent = 'Asistente Municipal de Puno: Estoy pensando...'; // Modificado
        chatWindow.appendChild(thinkingBubble);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        try {
            const response = await fetch('http://127.0.0.1:5000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    message: selectedOption, 
                    chat_history: conversationHistory,
                    uploaded_file_content: uploadedFileContent // Enviar el contenido del archivo subido
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            chatWindow.removeChild(thinkingBubble);
            addMessageToChat('chatbot', data.message, data.options);

        } catch (error) {
            console.error('Error al obtener respuesta del chatbot:', error);
            chatWindow.removeChild(thinkingBubble);
            addMessageToChat('chatbot', 'Asistente Municipal de Puno: Lo siento, hubo un error en la consulta. Por favor, intente de nuevo más tarde.'); // Modificado
            setInputState(false);
        }
    }


    async function sendMessage(initialMessage = null) {
        const userText = initialMessage || userInput.value.trim();
        if (userText === '') return;

        if (initialMessage === null) {
            addMessageToChat('user', userText);
        }
        userInput.value = '';

        setInputState(true);

        const thinkingBubble = document.createElement('div');
        thinkingBubble.classList.add('message-bubble', 'chatbot-message', 'thinking-message');
        thinkingBubble.textContent = 'Asistente Municipal de Puno: Estoy pensando...'; // Modificado
        chatWindow.appendChild(thinkingBubble);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        try {
            const response = await fetch('http://127.0.0.1:5000/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    message: userText, 
                    chat_history: conversationHistory,
                    uploaded_file_content: uploadedFileContent // Enviar el contenido del archivo subido
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            chatWindow.removeChild(thinkingBubble);
            addMessageToChat('chatbot', data.message, data.options);

        } catch (error) {
            console.error('Error al obtener respuesta del chatbot:', error);
            chatWindow.removeChild(thinkingBubble);
            addMessageToChat('chatbot', 'Asistente Municipal de Puno: Lo siento, hubo un error en la consulta. Por favor, intente de nuevo más tarde.'); // Modificado
            setInputState(false);
        }
    }
});