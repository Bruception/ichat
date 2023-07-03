import 'dotenv/config';
import { IMessageClient } from './imessage.js';
import { profanities } from './profanities.js';
import { Configuration, OpenAIApi } from 'openai';

const client = new IMessageClient({
    phoneNumber: process.env.TARGET_PHONE_NUMBER,
    chatDbPath: process.env.CHAT_DB_PATH
});

const configuration = new Configuration({
    organization: process.env.OPENAI_ORGANIZATION_ID,
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function main() {
    const messages = await client.getMessages();

    const messagesFormattedAsScript = messages.map((message) => {
        const { text, isFromMe } = message;

        const normalizedText = text.replace(/￼/g, '');
        const newText = normalizedText.length === 0 ? '<funny attachment>' : normalizedText;

        const newTextWithProfanitiesReplaced = newText.split(' ').map((word) => {
            const normalizedWord = word.toLowerCase();

            if (profanities.includes(normalizedWord)) {
                return '*'.repeat(word.length);
            }

            return word;
        }).join(' ');

        return `${isFromMe ? 'me' : 'them'}: ${newTextWithProfanitiesReplaced}`;
    });

    const script = `The following is a conversation with ${process.env.FRIEND_NAME}, a friend of mine. ${messagesFormattedAsScript.join("\n")}
    Please write a single response, in first person perspective that best continues the conversation.`;

    console.log('Prompt:', script);

    const response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
            {
                role: 'user',
                content: script,
            },
        ],
        temperature: 0.5,
        max_tokens: 150,
        n: 1,
        stream: false,
        stop: ['\n', " me:", " them:"],
    });

    const { choices: [choice] } = response.data;

    const message = choice.message?.content;
    client.sendMessage(message);

    console.log('Sent message:', message);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
