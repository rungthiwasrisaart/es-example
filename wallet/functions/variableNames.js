const variableNames = {
    eventNames: {
        userCreate: "userCreate",
        userCreateSuccess: "userCreateSuccess",
        walletCreate: "walletCreate",
        walletCreateSuccess: "walletCreateSuccess",
        depositCreate: "depositCreate",
        depositCreateSuccess: "depositCreateSuccess",
        depositUpdateConfirm: "depositUpdateConfirm",
        depositUpdateConfirmSuccess: "depositUpdateConfirmSuccess",
        walletDebitSuccess: "walletDebitSuccess"
    },
    collectionNames: {
        eventstore: "eventstore_wallet",
        user: "eventstore_wallet_user",
        wallet: "eventstore_wallet_wallet",
        deposit: "eventstore_wallet_deposit",
        // user: "eventstore_wallet_user_retry",
        // wallet: "eventstore_wallet_wallet_retry",
        // deposit: "eventstore_wallet_deposit_retry"
    }
}

module.exports = variableNames;