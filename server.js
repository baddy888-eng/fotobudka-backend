const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const PROJECT_ID = 'fotobudka-ai';
const LOCATION = 'us-central1';
const MODEL = 'imagen-3.0-edit-001';

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// 🔐 Autoryzacja (bez zmian - działa dobrze!)
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

// 📸 Edycja zdjęcia
app.post('/edit-photo', async (req, res) => {
    try {
        const { imageBase64, prompt } = req.body;

        if (!imageBase64 || !prompt) {
            return res.status(400).json({ error: 'Brak imageBase64 lub prompt' });
        }

        console.log('📸 Otrzymano zdjęcie z promptem:', prompt);
        const accessToken = await getAccessToken();

        const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

        // ✅ POPRAWIONA STRUKTURA - zgodna z dokumentacją Google
        const requestBody = {
            instances: [
                {
                    prompt: prompt,
                    referenceImages: [
                        {
                            referenceType: "REFERENCE_TYPE_RAW",
                            referenceId: 1,
                            referenceImage: {
                                bytesBase64Encoded: imageBase64,
                                mimeType: "image/jpeg"
                            }
                        }
                    ]
                }
            ],
            parameters: {
                sampleCount: 1,
                // ⚡ ZMIANA: używamy edit_mode bezpośrednio, nie editConfig!
                editMode: "inpainting-insert",  // Lub "inpainting-remove" lub "outpainting"
                // Opcjonalnie możesz dodać maskMode do automatycznego maskowania
                maskMode: "SEMANTIC"  // Model sam wykryje co edytować na podstawie promptu
            }
        };

        console.log('🚀 Wysyłam do Imagen (edycja)');
        console.log('📤 Struktura zapytania:', JSON.stringify(requestBody, null, 2).substring(0, 500));

        const response = await fetch(vertexUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Błąd API:', JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || 'Błąd wywołania Imagen API');
        }

        console.log('📩 Odpowiedź z Vertex otrzymana');
        console.log('📋 Struktura odpowiedzi:', JSON.stringify(data, null, 2).substring(0, 500));

        let editedImageBase64 = null;

        if (data.predictions && data.predictions.length > 0) {
            const pred = data.predictions[0];
            
            // Sprawdzamy różne możliwe formaty odpowiedzi
            if (pred.bytesBase64Encoded) {
                editedImageBase64 = pred.bytesBase64Encoded;
                console.log('✅ Znaleziono obraz w bytesBase64Encoded');
            } else if (pred.image?.bytesBase64Encoded) {
                editedImageBase64 = pred.image.bytesBase64Encoded;
                console.log('✅ Znaleziono obraz w image.bytesBase64Encoded');
            } else if (Array.isArray(pred.images) && pred.images[0]?.bytesBase64Encoded) {
                editedImageBase64 = pred.images[0].bytesBase64Encoded;
                console.log('✅ Znaleziono obraz w images[0].bytesBase64Encoded');
            }
        }

        if (!editedImageBase64) {
            console.error('❌ Nie znaleziono obrazu. Pełna odpowiedź:', JSON.stringify(data, null, 2));
            throw new Error('Nie otrzymano obrazu z Imagen');
        }

        console.log('✅ Odsyłam obraz do frontendu (długość:', editedImageBase64.length, ')');
        res.json({ image: editedImageBase64 });

    } catch (error) {
        console.error('❌ Błąd serwera:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🟢 Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(PORT, () => {
    console.log(`✅ Serwer fotobudki działa na porcie ${PORT}`);
    console.log(`📸 Model: ${MODEL} (Imagen 3.0 capability - edycja)`);
});

