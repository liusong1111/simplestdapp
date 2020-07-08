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
        this.ws.onopen = this.onWsOpen;
        this.ws.onerror = this.onWsError;
        this.promises = {}
        const authToken = window.localStorage.getItem("authToken");
        this.token = authToken;
        this.resolveFn = null;
        this.rejectFn = null;
        this.ready = new Promise((resolve, reject) => {
            this.resolveFn = resolve;
            this.rejectFn = reject;
        });
    }

    onWsOpen = () => {
        this.resolveFn();
    };

    onWsError = () => {
        this.rejectFn({code: -1, message: "establish_connection_error"});
    };

    onWsMessage = (msg) => {
        const payload = JSON.parse(msg.data)
        const {id, error, result} = payload
        if (error) {
            // alert(`error: code=${payload.error.code}, message=${payload.error.message}`)
            this.rejectPromise(id, error)
            return
        }
        if (result.token) {
            const {token} = result
            console.log(`token = ${token}`)
            this.token = token
            window.localStorage.setItem("authToken", token);
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

    queryAddresses = async (params) => {
        const result = await this.perform("query_addresses", params, true)
        return result.addresses
    }

    queryLiveCells = async (lockHash) => {
        const params = {
            lockHash,
        }
        const result = await this.perform("query_live_cells", params, true)
        return result.liveCells
    }

    signTransaction = async ({tx, meta, target, config}) => {
        const params = {
            tx,
            meta,
            target,
            config,
        }
        return await this.perform("sign", params, true)
    }

    signAndSendTransaction = async ({tx, meta, target, config}) => {
        const params = {
            tx,
            meta,
            target,
            config,
        }
        return await this.perform("signAndSend", params, true)
    }

    async perform(method, params, withToken) {
        if (withToken) {
            const token = this.token
            if (!token) {
                alert("Please click getAuth first")
                throw "NoAuthError"
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
        await this.ready;
        this.ws.send(JSON.stringify(payload))
        const promise = this.addPromise(id)
        return await promise
    }


}
