const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

const PROJECT_ID = 'fotobudka-ai';
const LOCATION = 'us-central1';
const MODEL = 'gemini-2.5-flash-image';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

async function getAccessToken() {
    try {
        const credentialsJson = process.env.GOOGLE_CREDENTIALS;
        if (!credentialsJson) throw new Error('Brak GOOGLE_CREDENTIALS');
        
        const credentials = JSON.parse(credentialsJson);
        
        const auth = new GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        return token.token;
        
    } catch (error) {
        console.error('❌ Błąd autoryzacji:', error);
        throw error;
    }
}

app.post('/edit-photo', async (req, res) => {
    try {
        const { imageBase64, prompt } = req.body;
        
        console.log('📸 Otrzymano zdjęcie');
        
        const accessToken = await getAccessToken();
        
        const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
        
        console.log('🚀 Wysyłam do Vertex AI');
        
        const requestBody = {
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
                ]
            }],
            generation_config: {
                response_modalities: ["image", "text"]
            }
        };

        const response = await fetch(vertexUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        console.log('📩 Otrzymano odpowiedź z Vertex AI');

        let editedImageBase64 = null;

        if (data.candidates && data.candidates[0]?.content?.parts) {
            console.log('📦 Znaleziono parts:', data.candidates[0].content.parts.length);
            
            // ⚡⚡⚡ POPRAWA: PRZESZUKUJEMY WSZYSTKIE CZĘŚCI ⚡⚡⚡
            for (const part of data.candidates[0].content.parts) {
                console.log('🔍 Part keys:', Object.keys(part));
                
                if (part.inline_data?.data) {
                    editedImageBase64 = part.inline_data.data;
                    console.log('✅ Znaleziono obraz w odpowiedzi!');
                    break;  // PRZERYWAMY PO ZNALEZIENIU OBRAZU
                }
                
                if (part.text) {
                    console.log('📝 Model zwrócił tekst:', part.text.substring(0, 200));
                    // KONTYNUUJEMY SZUKANIE – NIE PRZERYWAMY!
                }
            }
        }

        if (!editedImageBase64) {
            console.error('❌ Nie znaleziono obrazu w odpowiedzi');
            if (data.error) {
                throw new Error(`Błąd Vertex AI: ${data.error.message}`);
            }
            throw new Error('Nie otrzymano obrazu z API');
        }
        
        console.log('✅ Odsyłam obraz do frontendu');
        res.json({ image: editedImageBase64 });

    } catch (error) {
        console.error('❌ Błąd serwera:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(PORT, () => {
    console.log(`✅ Serwer fotobudki działa na porcie ${PORT}`);
});
