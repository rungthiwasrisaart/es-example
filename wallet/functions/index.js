const admin = require('firebase-admin');
const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();
const { check, validationResult } = require('express-validator');

const variableNames = require("./variableNames");

admin.initializeApp(functions.config().firebase);

let db = admin.firestore();

//**************** pub/sub ****************//
// Imports the Google Cloud client library
const { PubSub } = require('@google-cloud/pubsub');
// Creates a client; cache this for further use
const pubSubClient = new PubSub();


// Automatically allow cross-origin requests
app.use(cors({ origin: true }));

app.get('/hello', async (req, res) => {
    /**
    * TODO(developer): Uncomment these variables before running the sample.
    */
    const addDoc = await db.collection(variableNames.collectionNames.user).add({
        firstname: 'firstname',
        lastname: 'lastname',
        email: 'email',
        timestamp: new Date()
    })
    console.log('addDoc : ', addDoc)
    console.log('addDoc : ', addDoc.id)
    console.log('addDoc : ', addDoc.data)
    return res.status(200).json({
        message: 'success.'
    });
});

app.post("/admin/events/retry", async (req, res) => {
    const eventstoreQuery = await db.collection(variableNames.collectionNames.eventstore).orderBy("timestamp", "asc").get()
    if (eventstoreQuery.empty) {
        console.log('No document!')
    } else {
        for (let i = 0; i < eventstoreQuery.docs.length; i++) {
            const doc = eventstoreQuery.docs[i]
            const { type, data } = doc.data()
            console.log('type : ', type)
            // make message
            const message = {
                json: {
                    eventstoreId: doc.id,
                    data: data
                }
            }
            // console.log('message : ', message)
            if (type === variableNames.eventNames.userCreate) {
                const { eventstoreId } = message.json
                const { firstname, lastname, email } = message.json.data
                await db.collection(`${variableNames.collectionNames.user}_retry`).doc(eventstoreId).set({
                    firstname,
                    lastname,
                    email,
                    timestamp: new Date()
                })
            } else if (type === variableNames.eventNames.walletCreate) {
                const { userId, walletId } = message.json.data
                // userCreateSuccess
                await db.collection(`${variableNames.collectionNames.wallet}_retry`).doc(walletId).set({
                    userId,
                    balance: [],
                    timestamp: new Date()
                })
                // walletCreate
                await db.collection(`${variableNames.collectionNames.user}_retry`).doc(userId).set({
                    walletId
                }, { merge: true })
            } else if (type === variableNames.eventNames.depositCreate) {
                const { eventstoreId } = message.json
                const { userId, amount, depositType } = message.json.data

                let userDoc = await db.collection(`${variableNames.collectionNames.user}_retry`).doc(userId).get();
                if (!userDoc.exists) {
                    console.log('No such document!');
                } else {
                    const { walletId } = userDoc.data()
                    await db.collection(`${variableNames.collectionNames.deposit}_retry`).doc(eventstoreId).set({
                        userId,
                        amount,
                        depositType,
                        walletId,
                        isConfirm: false,
                        timestamp: new Date()
                    })
                }
            } else if (type === variableNames.eventNames.depositUpdateConfirm) {
                const { depositId, adminName } = message.json.data
                let userDoc = await db.collection(`${variableNames.collectionNames.deposit}_retry`).doc(depositId).get();
                if (!userDoc.exists) {
                    console.log('No such document!');
                } else {
                    const { isConfirm } = userDoc.data()
                    if (!isConfirm) {
                        await db.collection(`${variableNames.collectionNames.deposit}_retry`).doc(depositId).set({
                            adminName,
                            isConfirm: true
                        }, { merge: true })
                    } else {
                        console.log('Deposit is confirm!');
                    }
                }
            } else if (type === variableNames.eventNames.depositUpdateConfirmSuccess) {
                
                const { amount, depositType, userId, walletId } = message.json.data

                let walletDoc = await db.collection(`${variableNames.collectionNames.wallet}_retry`).doc(walletId).get();
                if (!walletDoc.exists) {
                    console.log('No such document!');
                } else {
                    if (depositType === 'THB') {
                        let { THB } = walletDoc.data()
                        if (THB) {
                            THB += Number(amount)
                        } else {
                            THB = Number(amount)
                        }

                        await db.collection(`${variableNames.collectionNames.wallet}_retry`).doc(walletId).set({
                            THB,
                        }, { merge: true })
                    }
                }
            } else {
                console.log('No action!')
            }
        }
    }

    return res.status(200).json({
        message: 'success'
    })
})

app.get("/admin", async (req, res) => {
    const eventstoreQuery = await db.collection(variableNames.collectionNames.eventstore).orderBy("timestamp", "asc").get()
    const event = eventstoreQuery.empty ? [] : eventstoreQuery.docs.map(doc => doc.data());

    const walletQuery = await db.collection(variableNames.collectionNames.wallet).orderBy("timestamp", "asc").get()
    const wallets = walletQuery.empty ? [] : walletQuery.docs.map(doc => doc.data());

    const depositQuery = await db.collection(variableNames.collectionNames.deposit).orderBy("timestamp", "asc").get()
    const deposits = depositQuery.empty ? [] : depositQuery.docs.map(doc => doc.data());

    const userQuery = await db.collection(variableNames.collectionNames.user).orderBy("timestamp", "asc").get()
    const users = userQuery.empty ? [] : userQuery.docs.map(doc => doc.data());

    const walletQuery2 = await db.collection(`${variableNames.collectionNames.wallet}_retry`).orderBy("timestamp", "asc").get()
    const wallets2 = walletQuery2.empty ? [] : walletQuery2.docs.map(doc => doc.data());

    const depositQuery2 = await db.collection(`${variableNames.collectionNames.deposit}_retry`).orderBy("timestamp", "asc").get()
    const deposits2 = depositQuery2.empty ? [] : depositQuery2.docs.map(doc => doc.data());

    const userQuery2 = await db.collection(`${variableNames.collectionNames.user}_retry`).orderBy("timestamp", "asc").get()
    const users2 = userQuery2.empty ? [] : userQuery2.docs.map(doc => doc.data());

    return res.status(200).json({
        users,
        users2,
        wallets,
        wallets2,
        deposits,
        deposits2,
        event
    })
})

app.put("/admin/deposit/confirm/:id", [
    check('adminName').not().isEmpty().withMessage('Require field input adminName.'),
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        let messages = '-'
        // console.log(errors)
        for (let item of errors.array()) {
            messages = item.msg
            break
        }
        return res.status(422).json({
            messages: messages,
            error: errors.array()
        })
    }

    try {
        const { id } = req.params
        const { adminName } = req.body

        const addDoc = await db.collection(variableNames.collectionNames.eventstore).add({
            type: variableNames.eventNames.depositUpdateConfirm,
            data: {
                depositId: id,
                adminName
            },
            timestamp: new Date()
        })

        return res.status(200).json({
            message: 'success.',
            orderId: addDoc.id
        })
    } catch (err) {
        console.error('order : ', err)
        return res.status(400).json({
            message: 'Error'
        })
    }
})

app.post('/user/deposit', [
    check('userId').not().isEmpty().withMessage('Require field input userId.'),
    check('amount').not().isEmpty().withMessage('Require field input amount.'),
    check('depositType').not().isEmpty().withMessage('Require field input depositType.'),
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        let messages = '-'
        // console.log(errors)
        for (let item of errors.array()) {
            messages = item.msg
            break
        }
        return res.status(422).json({
            messages: messages,
            error: errors.array()
        })
    }

    try {
        const { userId, amount, depositType } = req.body

        const addDoc = await db.collection(variableNames.collectionNames.eventstore).add({
            type: variableNames.eventNames.depositCreate,
            data: {
                userId,
                amount: Number(amount),
                depositType,
            },
            timestamp: new Date()
        })

        return res.status(200).json({
            message: 'success.',
            eventstoreId: addDoc.id
        })
    } catch (err) {
        console.error('order : ', err)
        return res.status(400).json({
            message: 'Error'
        })
    }
});

app.post('/user', [
    check('firstname').not().isEmpty().withMessage('Require field input shylaiId.'),
    check('lastname').not().isEmpty().withMessage('Require field input language.'),
    check('email').not().isEmpty().withMessage('Require field input list.'),
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        let messages = '-'
        // console.log(errors)
        for (let item of errors.array()) {
            messages = item.msg
            break
        }
        return res.status(422).json({
            messages: messages,
            error: errors.array()
        })
    }

    try {
        const { firstname, lastname, email } = req.body

        const addDoc = await db.collection(variableNames.collectionNames.eventstore).add({
            type: variableNames.eventNames.userCreate,
            data: {
                firstname,
                lastname,
                email,
            },
            timestamp: new Date()
        })

        return res.status(200).json({
            message: 'success.',
            eventstoreId: addDoc.id
        })
    } catch (err) {
        console.error('order : ', err)
        return res.status(400).json({
            message: 'Error'
        })
    }
});

exports.cqrs_wallet_api = functions.https.onRequest(app);

exports.cqrs_wallet_firestore_trigger = functions.firestore
    .document(`${variableNames.collectionNames.eventstore}/{eventstoreId}`)
    .onCreate(async (snapshot, context) => {
        // console.log(context)
        // console.log(snapshot.data())
        const { eventstoreId } = context.params
        const { type } = snapshot.data()
        const topicName = type;
        const data = JSON.stringify({
            ...snapshot.data(),
            eventstoreId
        });
        const dataBuffer = Buffer.from(data);

        const messageId = await pubSubClient.topic(topicName).publish(dataBuffer);
        console.log(`Message ${messageId} published.`);
        return null;
    });

exports.cqrs_wallet_userCreate = functions.pubsub.topic(variableNames.eventNames.userCreate).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    // console.log('message : ', message.json)
    const { eventstoreId } = message.json
    const { firstname, lastname, email } = message.json.data
    await db.collection(variableNames.collectionNames.user).doc(eventstoreId).set({
        firstname,
        lastname,
        email,
        timestamp: new Date()
    })

    await db.collection(variableNames.collectionNames.eventstore).add({
        type: variableNames.eventNames.userCreateSuccess,
        data: {
            eventstoreId
        },
        timestamp: new Date()
    })

    return null;
});

exports.cqrs_wallet_userCreateSuccess = functions.pubsub.topic(variableNames.eventNames.userCreateSuccess).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    // console.log('message : ', message.json)
    const { eventstoreId } = message.json.data
    console.log(`Created User ${eventstoreId}.`)

    return null;
});

exports.cqrs_wallet_userCreateSuccessWallet = functions.pubsub.topic(variableNames.eventNames.userCreateSuccess).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    // console.log('message : ', message.json)
    const { eventstoreId: userId } = message.json.data

    const addDoc = await db.collection(variableNames.collectionNames.wallet).add({
        userId,
        balance: [],
        timestamp: new Date()
    })

    await db.collection(variableNames.collectionNames.eventstore).add({
        type: variableNames.eventNames.walletCreate,
        data: {
            userId,
            walletId: addDoc.id
        },
        timestamp: new Date()
    })

    return null;
});

exports.cqrs_wallet_walletCreate = functions.pubsub.topic(variableNames.eventNames.walletCreate).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    // console.log('message : ', message.json)
    // const { eventstoreId } = message.json.data
    // console.log(`Created User ${eventstoreId}.`)
    const { eventstoreId } = message.json
    const { userId, walletId } = message.json.data

    await db.collection(variableNames.collectionNames.user).doc(userId).set({
        walletId
    }, { merge: true })

    await db.collection(variableNames.collectionNames.eventstore).add({
        type: variableNames.eventNames.walletCreateSuccess,
        data: {
            eventstoreId
        },
        timestamp: new Date()
    })

    return null;
});

exports.cqrs_wallet_walletCreateSuccess = functions.pubsub.topic(variableNames.eventNames.walletCreateSuccess).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    console.log('message : ', message.json)
    // const { eventstoreId } = message.json.data
    // console.log(`Created User ${eventstoreId}.`)
    // const { eventstoreId } = message.json
    // const { userId, walletId } = message.json.data

    return null;
});

exports.cqrs_wallet_depositCreate = functions.pubsub.topic(variableNames.eventNames.depositCreate).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    // console.log('message : ', message.json)
    // const { eventstoreId } = message.json.data
    // console.log(`Created User ${eventstoreId}.`)
    const { eventstoreId } = message.json
    const { userId, amount, depositType } = message.json.data

    let userDoc = await db.collection(variableNames.collectionNames.user).doc(userId).get();
    if (!userDoc.exists) {
        console.log('No such document!');
    } else {
        const { walletId } = userDoc.data()
        await db.collection(variableNames.collectionNames.deposit).doc(eventstoreId).set({
            userId,
            amount,
            depositType,
            walletId,
            isConfirm: false,
            timestamp: new Date()
        })

        await db.collection(variableNames.collectionNames.eventstore).add({
            type: variableNames.eventNames.depositCreateSuccess,
            data: {
                eventstoreId
            },
            timestamp: new Date()
        })
    }

    return null;
});

exports.cqrs_wallet_depositCreateSuccess = functions.pubsub.topic(variableNames.eventNames.depositCreateSuccess).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    // console.log('message : ', message.json)
    const { eventstoreId } = message.json.data
    console.log(`Created Deposit ${eventstoreId}.`)

    return null;
});

exports.cqrs_wallet_depositUpdateConfirm = functions.pubsub.topic(variableNames.eventNames.depositUpdateConfirm).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    // console.log('message : ', message.json)
    // const { eventstoreId } = message.json
    const { depositId, adminName } = message.json.data
    // console.log('eventstoreId : ', eventstoreId)
    // console.log('depositId : ', depositId)
    // console.log('adminName : ', adminName)

    let userDoc = await db.collection(variableNames.collectionNames.deposit).doc(depositId).get();
    if (!userDoc.exists) {
        console.log('No such document!');
    } else {
        const { isConfirm, depositType, amount, walletId, userId } = userDoc.data()
        if (!isConfirm) {
            await db.collection(variableNames.collectionNames.deposit).doc(depositId).set({
                adminName,
                isConfirm: true
            }, { merge: true })

            await db.collection(variableNames.collectionNames.eventstore).add({
                type: variableNames.eventNames.depositUpdateConfirmSuccess,
                data: {
                    depositType,
                    amount,
                    walletId,
                    userId
                },
                timestamp: new Date()
            })
        } else {
            console.log('Deposit is confirm!');
        }

    }

    return null;
});

exports.cqrs_wallet_depositUpdateConfirmSuccess = functions.pubsub.topic(variableNames.eventNames.depositUpdateConfirmSuccess).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    console.log('message : ', message.json)
    // const { eventstoreId } = message.json.data
    // console.log(`Created User ${eventstoreId}.`)
    // const { eventstoreId } = message.json
    // const { userId, walletId } = message.json.data

    return null;
});

exports.cqrs_wallet_depositUpdateConfirmSuccessDebit = functions.pubsub.topic(variableNames.eventNames.depositUpdateConfirmSuccess).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    console.log('message : ', message.json)
    // const { eventstoreId } = message.json.data
    // console.log(`Created User ${eventstoreId}.`)
    // const { eventstoreId } = message.json
    const { amount, depositType, userId, walletId } = message.json.data

    let walletDoc = await db.collection(variableNames.collectionNames.wallet).doc(walletId).get();
    if (!walletDoc.exists) {
        console.log('No such document!');
    } else {
        if (depositType === 'THB') {
            let { THB } = walletDoc.data()
            if (THB) {
                THB += Number(amount)
            } else {
                THB = Number(amount)
            }

            await db.collection(variableNames.collectionNames.wallet).doc(walletId).set({
                THB,
            }, { merge: true })

            await db.collection(variableNames.collectionNames.eventstore).add({
                type: variableNames.eventNames.walletDebitSuccess,
                data: {
                    userId
                },
                timestamp: new Date()
            })
        }
    }

    return null;
});

exports.cqrs_wallet_walletDebitSuccess = functions.pubsub.topic(variableNames.eventNames.walletDebitSuccess).onPublish(async (message) => {
    // [START readJson]
    // Get the `name` attribute of the PubSub message JSON body.
    console.log('message : ', message.json)
    // const { eventstoreId } = message.json.data
    // console.log(`Created User ${eventstoreId}.`)
    // const { eventstoreId } = message.json
    // const { userId, walletId } = message.json.data

    return null;
});
