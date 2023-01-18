const stickers = require('./stickers.json');
const { spawn, execSync } = require('child_process');
const config = require('../config.json');
const { v4: uuidv4 } = require('uuid');
const LogsParser = require('./logsParser.js');

class TestManager {
    constructor(telegramApi, sendFile) {
        this.queue = [];
        this.telegramReq = telegramApi.telegramReq;
        this.sendMessage = telegramApi.sendMessage;
        this.showKeyBoard = telegramApi.showKeyBoard;
        this.sendSticker = telegramApi.sendSticker;
        this.sendTgFile = telegramApi.sendTgFile;
        this.sendFile = sendFile;
        this.busy = false;
        this.handler();
    };

    createSession(shortTest, chatId) {
        let testId = uuidv4();
        let newSession = {
            test_id: testId,
            chat_id: chatId,
            status: 'wait',
            short_test: shortTest
        };
        this.queue.push(newSession);
        console.log(`New session created. Info: ${JSON.stringify(newSession, null, '\t')}`);
        console.log('---------------------------------------------');
    };

    rand (max) {
        return Math.floor(Math.random() * max);
    };

    getStiker (err) {
        return (err) ? stickers.error[this.rand(stickers.error.length)] : stickers.success[this.rand(stickers.success.length)];
    };

    getHalfPreparedTest(chatId) {
        for (let session of this.queue)
            if (session !== undefined && session.chat_id == chatId && session.status == 'wait')
                return session.test_id;
        return false;
    };

    cancelSession(testId) {
        this.queue = this.queue.filter(el => el.status != 'wait' || el.test_id != testId);
    };

    validFile(result) {
        try {
            if ((new RegExp('[a-z|A-Z|0-9|\\-|\\+|\\.|/]+\\.apk$')).test(result))
                return true;
            else {
                console.log('I\'m not fine');
                return false;
            }
        } catch {
            console.log('Catch err');
            return false;
        }
    };

    continueCreatingSession(fileId, chatId) {
        return new Promise((resolve, reject) => {
            for (let session of this.queue) {
                if (session !== undefined && session.chat_id == chatId && session.status == 'wait') {
                    session.status = 'ready';
                    session.file_id = fileId;
                    resolve();
                    return;
                }
            }
            reject('There is no session to launch. Choose the type of test.');
        });
    };

    launchTest(session) {
        return new Promise(async (resolve, reject) => {
            session.status = 'running';
            let res = await this.telegramReq('POST', 'getFile', {
                file_id: session.file_id
            });
            res = await res.json();
            if (this.validFile(res.result.file_path)) {
                let arrBuf = await (await this.telegramReq('GET', 'file', undefined, res.result.file_path)).arrayBuffer();
                arrBuf = new Uint8Array(arrBuf);
                await this.sendFile(config.url, config.port, arrBuf)
                .then(() => { }, err => { 
                    this.cancelSession(session.test_id);
                    reject(err);
                    res = false;
                });
                if (!res) {
                    await this.sendMessage(session.chat_id, 'Data exchange error. Please, contact the developer. Cancel the session.');
                    await this.showKeyBoard(session.chat_id, 'Choose an action');
                    this.cancelSession(session.test_id);
                    reject();
                    return;
                }
            } else {
                await this.sendMessage(session.chat_id, 'Invalid file. Cancel the session');
                await this.showKeyBoard(session.chat_id, 'Choose an action');
                this.cancelSession(session.test_id);
                reject('Wrong file');
                return;
            }

            // execSync('./trinity_test.bash --netbuild', {
            //     cwd : '/root/NODE/node-dev/test/nodeStart/'
            // });

            let process;
            if (session.short_test) {
                this.sendMessage(session.chat_id, 'Fast test has started');
                process = spawn('node', ['./node_modules/mocha/bin/mocha', './client-side/fastTest.js'], {
                    cwd : '../'
                });
            } else {
                this.sendMessage(session.chat_id, 'Long test has started');
                process = spawn('node', ['./node_modules/mocha/bin/mocha', './client-side/test.js'], {
                    cwd : '../'
                });
            }
            process.stdout.on('data', (data) => {
                session.data += data.toString('utf8');
            });
            process.on('exit', async (data) => {
                session.status = 'done';
                if (data == 0) {
                    await this.sendMessage(session.chat_id, 'Test has passed');
                    await this.sendSticker(session.chat_id, this.getStiker(false));
                } else {
                    await this.sendMessage(session.chat_id, 'Test has failed');
                    // await this.sendMessage(session.chat_id, session.data.replace('undefined', ''));
                    await this.sendSticker(session.chat_id, this.getStiker(true));
                }
                let logParser = new LogsParser(session.data);
                await this.sendMessage(session.chat_id, logParser.parse());
                this.showKeyBoard(session.chat_id, 'Choose an action');
                resolve();
            });
        });
    };

    handler() {
        setInterval(async () => {
            if (!this.busy)
                for (let i in this.queue)
                    if (this.queue[i] !== undefined && this.queue[i].status == 'ready') {
                        this.busy = true;
                        this.launchTest(this.queue[i])
                        .then(() => {
                            delete this.queue[i];
                            this.busy = false;
                        },
                        err => {
                            console.log(err);
                            delete this.queue[i];
                            this.busy = false;
                        });
                        break;
                    }
        }, 1000);
    };
};

module.exports = TestManager;