import 'dotenv/config';
import { IMessageClient } from './imessage.js';
import { profanities } from './profanities.js';
import { Configuration, OpenAIApi } from 'openai';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const client = new IMessageClient({
    phoneNumber: process.env.TARGET_PHONE_NUMBER,
    chatDbPath: process.env.CHAT_DB_PATH,
    maxMessages: process.env.MAX_MESSAGES,
});

const configuration = new Configuration({
    organization: process.env.OPENAI_ORGANIZATION_ID,
    apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

let model = process.env.MODEL || 'gpt-3.5-turbo';

async function main() {
    const rl = readline.createInterface({ input, output });

    let promptExtension = process.env.PROMPT_EXTENSION || '';
    let messagePreview = null;

    while (true) {
        const command = await rl.question('> ');

        if (command === 'exit') {
            break;
        } else if (command === 'prompt') {
            const prompt = await getPrompt(promptExtension);
            console.log(prompt);
        } else if (command.startsWith('set')) {
            const parameters = command.split(' ');

            if (parameters.length < 3) {
                console.log('Invalid set command. You can set model, prm-ext, or max-msgs.');
                continue;
            }

            const [_, parameter, ...value] = parameters;

            if (parameter === 'prm-ext') {
                promptExtension = value.join(' ');
                console.log('Prompt extension set to:', promptExtension);
            } else if (parameter === 'max-msgs') {
                const maxMessages = parseInt(value[0], 10);
                client.setMaxMessages(maxMessages);
                console.log('Max messages set to:', maxMessages);
            } else if (parameter === 'model') {
                model = value.join(' ');
                console.log('Model set to:', model);
            } else {
                console.log('Invalid set command');
            }
        } else if (command === 'preview') {
            const prompt = await getPrompt(promptExtension);
            const reply = await getReply(prompt);
            messagePreview = reply;

            console.log('Previewing reply:', reply);
        } else if (command === 'reply') {
            let sentMessage = null;

            if (messagePreview === null) {
                const prompt = await getPrompt(promptExtension);
                sentMessage = await getReplyAndSend(prompt);
            } else {
                await sendReply(messagePreview);
                sentMessage = messagePreview;
            }

            messagePreview = null;
            console.log('Sent message:', sentMessage);
        } else {
            console.log('Invalid command. Valid commands are: prompt, set, preview, reply, exit');
        }
    }

    rl.close();
    process.exit(0);
}

async function getPrompt(promptExtension = '') {
    const messages = await client.getMessages();

    const filteredMessages = messages.filter(({ text }) => text !== null);
    const messagesFormattedAsScript = filteredMessages.map(({ text, date, isFromMe }) => {
        const normalizedText = text.replace(/￼/g, '');
        const newText = normalizedText.length === 0 ? '<funny attachment>' : normalizedText;

        const newTextWithProfanitiesReplaced = newText
            .split(' ')
            .map(word => (profanities.includes(word.toLowerCase()) ? '*'.repeat(word.length) : word))
            .join(' ');

        return `\t${isFromMe ? 'me' : 'them'} @ (${date.toISOString()}): ${newTextWithProfanitiesReplaced}`;
    });

    const conversationScript = messagesFormattedAsScript.join("\n");

    return `The following is a conversation log with my friend ${process.env.FRIEND_NAME}:
    \n${conversationScript}
    \nYou MUST write reply as me, in first person perspective that best continues the conversation. DO NOT INCLUDE any indicators of who sent the message or timestamp. The current timestamp is ${new Date().toISOString()}. If they have not responded in a while, send a bump. ${promptExtension}`;
}

async function getReply(prompt) {
    const response = await openai.createChatCompletion({
        model,
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
        temperature: 0.5,
        max_tokens: 150,
        n: 1,
        stream: false,
        stop: ['\n', '\t', "me:", " them:"],
    });

    const { choices: [choice] } = response.data;

    return choice.message?.content;
}

async function sendReply(message) {
    await client.sendMessage(message);
}

async function getReplyAndSend(prompt) {
    const reply = await getReply(prompt);
    await sendReply(reply);
    return reply;
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
