const config = require('./config.json');
const fetch = require('node-fetch');
const args = require("yargs").argv;
const systemMsgs = require('./msgsPresets.json');
const stickers = require('./stickers.json');
const fs = require('fs');

let TelegramBot = function (config) {
    //============================================================================ telegram api config
    let _url = config.url;
    let _token = (args.token) ? args.token : config.token;
    //============================================================================== dictionary config
    
    let _errBorder = (args.errBorder) ? args.errBorder : config.errBorder;
    let _dictIndex = -1;
    let _errLen = 100;
    let _keyWords = require('./keyWords.json');
    let _allWords = [];

    //=================================================================================== telegram API

    this.telegramReq = function (mthd, api, data, filePath) {
        if (filePath === undefined) {
            return fetch(`${_url}/bot${_token}/${api}`, (data !== undefined) ? {
                method : mthd,
                body : JSON.stringify(data),
                headers : {'Content-Type': 'application/json'}
            } : {
                method : mthd
            });
        } else {
            return fetch(`${_url}/${api}/bot${_token}/${filePath}`);
        };
    };

    this.sendTgFile = function (chat, data) {
        return this.telegramReq('POST', 'sendDocument', {
            chat_id : chat,
            document : data
        });
    };

    this.sendMessage = function (chat, message) {
        return this.telegramReq('POST', 'sendMessage', {
            chat_id : chat,
            text : message
        });
    };

    this.sendSticker = function (id, stickers, replyId) {
        let sticker_id = stickers[Math.floor(Math.random() * stickers.length)]
        return this.telegramReq('POST', 'sendSticker', {
            chat_id : id,
            sticker : sticker_id,
            reply_to_message_id : replyId
        });
    };

    this.sendReaction = function (id, msgId, reaction) {
        return this.telegramReq('POST', 'sendReaction', {
            chat_id : id,
            msg_id : msgId,
            reaction : ":clown:"
        });
    };

    this.showKeyBoard = function (chat, message) {
        return this.telegramReq('POST', 'sendMessage', {
            chat_id : chat,
            text : message,
            reply_markup : {
                inline_keyboard : [
                    config.buttons
                ]
            }
        });
    };

    //========================================================================= send file.apk on server

    this.sendFile = function (url, port, arrBuf) {
        return fetch(`${url}:${port}/putApk`, {
            method : 'PUT',
            body : arrBuf,
            headers : {'Content-Type': 'application/octet-stream'}
        });
    };

    //==================================================================================================

    this.getKeyWords = function () {
        return _keyWords;
    };

    this.getCheckWords = function () {
        if (_allWords.length == 0)
            for (let i in _keyWords)
                _allWords = _allWords.concat(_keyWords[i]);
        return _allWords;
    };

    this.findMinLength = function (checked) {
        _errLen = 100;
        for (let j in this.getCheckWords()) {
            let word = this.getCheckWords()[j];
            let errLen = 0;
            for (let i = 0; i < word.length; i++) {
                if (word[i] !== checked[i])
                    errLen++;
            }
            if (_errLen > errLen) {
                _errLen = errLen;
                _dictIndex = j;
            }
        }
    };

    this.getOption = function() {
        if (_errLen > _errBorder)
            return -1;
        let sum = 0;
        let keyWords = this.getKeyWords();
        for (let i in keyWords) {
            sum += keyWords[i].length;
            if (sum >= (+_dictIndex + 1))
                return i;
        }
    };

    this.reactOnMessage = async function (message) {
        const clownUser = "840018001"
        const clownReaction = ":clown:"

        if (message.from.id == clownUser)
            this.sendReaction(message.chat.id, message.message_id, clownReaction)
    }

    this.rmDuplicates = function (arr) {
        return [...new Set(arr)]
    }

    this.joinPhrases = function (inputWords) {
        const phrases = {
            clown : {
                words : ["based", "oleg"]
            }
        }
    
        Object.keys(phrases).forEach(phraseName => {
            let delIndex = []
            let phrase = phrases[phraseName]
            let proven = phrase.words.every(word => {
                let res = inputWords.indexOf(word)
                if (res === -1)
                    return false
                delIndex.push(res)
                return true
            })
            if (proven) {
                for (let i of delIndex)
                    inputWords.splice(i, 1, null)
                inputWords.push(phraseName)
            }
        })
        inputWords = inputWords.filter(word => word !== null)
        return inputWords
    }

    this.figureOutAction = async function (words, message) {
        let id = message.chat.id, user = message.from    
        
        words = this.rmDuplicates(words)
        words = this.joinPhrases(words)

        const model = ["haha_words", "yes", "clown"]

        words.forEach(keyWord => {
            if (model.indexOf(keyWord) === -1)
                return

            if (keyWord === "haha_words")
                this.sendSticker(id, stickers.haha_stikers)
            else if (keyWord === "clown")
                this.sendSticker(id, stickers.base_clown)
            else if (keyWord === "yes")
                this.sendSticker(id, stickers.bad_words, message.message_id)
        })
    };
};

let BotClient = function (config) {
    if (!new.target)
        return new BotClient(config);
    TelegramBot.call(this, config);

    let _updId = (config.lastUpd) ? config.lastUpd : undefined;

    this.getUpdates = function (lastUpd) {
        return this.telegramReq('POST', 'getUpdates', {
            offset : lastUpd
        });
    };

    this.wordsLog = function (words, chat_id, user_id, time) {
        let date = new Date(time * 1000);
        console.log(`User_id: ${user_id}, chat_id: ${chat_id}`);
        console.log(`Date: ${date.toUTCString()}`);
        console.log('Incoming message: ');
        console.log(words);
        console.log('---------------------------------------------');
    };

    this.parseMsg = function (message) {
        let msg = message.text, id = message.chat.id
        let {from, date} = message
        try {
            msg = msg.trim().toLowerCase();
        } catch {
            return;
        }
        let words = msg.split(' ');
        for (let i in words) {
            this.findMinLength(words[i]);
            let opt = this.getOption();
            words[i] = (opt == -1) ? (() => {
                return words[i];
            })() : opt;
        }
        this.wordsLog(words, id, from.id, date);
        this.figureOutAction(words, message);
    };

    this.handleUpdates = async function (upds) {
        for (let upd of upds) {
            if (upd.callback_query !== undefined) {
                upd.message = {
                    chat : {
                        id : upd.callback_query.message.chat.id
                    },
                    text : upd.callback_query.data,
                    from : upd.callback_query.message.from,
                    date : upd.callback_query.message.date
                };
            }
            
            try {
                if (upd.message.text == '/start') {
                    await this.sendMessage(upd.message.chat.id, systemMsgs.greetings);
                    await this.showKeyBoard(upd.message.chat.id, 'Кнопочьки');
                    this.wordsLog(['/start'], upd.message.chat.id, upd.message.from.id, upd.message.date);
                } else if (upd.message.text == '/buttons') {
                    await this.showKeyBoard(upd.message.chat.id, 'Choose the action');
                    this.wordsLog(['/buttons'], upd.message.chat.id, upd.message.from.id, upd.message.date);
                } else {
                    this.reactOnMessage(upd.message);
                    this.parseMsg(upd.message);
                }
            } catch (e) {
                console.log(e)
            }
        }
    };

    this.start = async function () {
        while (true) {
            await new Promise(resolve => { setTimeout(() => {resolve()}, 1000) });
            let updates = await this.getUpdates(_updId + 1);
            updates = (await updates.json()).result;
            if (updates !== undefined && updates.length > 0) {
                _updId = updates[updates.length - 1].update_id;
                config.lastUpd = _updId;
                fs.writeFile('./config.json', JSON.stringify(config, null, '\t'), (err) => {
                    if (err)
                        console.log(err);
                });
                console.log(`Last update: ${_updId}`);
                console.log('---------------------------------------------');
                this.handleUpdates(updates);
            }
        }
    };
};

let BotServer = function (config) {
    if (!new.target)
        return new BotServer(config);
    TelegramBot.call(this, config);

    this.setWebhook = function () {
        // TODO
    };

    this.start = async function () {
        // TODO
    };
};

let bot = BotClient(config);
bot.start();
