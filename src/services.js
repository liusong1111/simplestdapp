import CKB from "@nervosnetwork/ckb-sdk-core";

export class RpcService {
    constructor(privateKey) {
        this.ckb = new CKB("https://prototype.ckbapp.dev/testnet/rpc")
        this.privateKey = privateKey
    }

    signTransaction = async (tx) => {
        return this.ckb.signTransaction(this.privateKey)(tx)
    };

    sendTransaction = async (tx) => {
        return await this.ckb.rpc.sendTransaction(tx)
    };
}

export class KeyperingService {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = this.onWsMessage;
        this.token = null
        this.promises = {}
    }

    onWsMessage = (msg) => {
        const payload = JSON.parse(msg.data)
        const {id, error, result} = payload
        if (error) {
            alert(`error: code=${payload.error.code}, message=${payload.error.message}`)
            this.rejectPromise(id, error)
            return
        }
        if (result.token) {
            const {token} = result
            console.log(`token = ${token}`)
            this.token = token
        }
        this.resolvePromise(id, result)
    }

    addPromise = (id) => {
        let resolve, reject;
        const promise = new Promise((_resolve, _reject) => {
            resolve = _resolve
            reject = _reject
        })
        this.promises[id] = {
            resolve,
            reject,
        }
        return promise
    }

    resolvePromise = (id, result) => {
        const promise = this.promises[id]
        if (!promise) {
            return
        }
        this.promises[id] = undefined
        promise.resolve(result)
    }

    rejectPromise = (id, error) => {
        const promise = this.promises[id]
        if (!promise) {
            return
        }
        this.promises[id] = undefined
        promise.reject(error)
    }

    requestAuth = async (params) => {
        return await this.perform("auth", params, false)
    }

    signTransaction = async ({tx, meta}) => {
        const params = {
            tx,
            meta,
        }
        return await this.perform("sign", params, true)
    }

    signAndSendTransaction = async ({tx, meta}) => {
        const params = {
            tx,
            meta,
        }
        return await this.perform("signAndSend", params, true)
    }

    async perform(method, params, withToken) {
        if (withToken) {
            const token = this.token
            if (!token) {
                alert("Please click getAuth first")
                return
            } else {
                params.token = token
            }
        }

        const id = new Date().getTime()
        const payload = {
            id,
            jsonrpc: "2.0",
            method,
            params,
        }
        this.ws.send(JSON.stringify(payload))
        const promise = this.addPromise(id)
        return await promise
    }


}
