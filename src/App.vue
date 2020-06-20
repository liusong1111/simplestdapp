<template>
    <div id="app">
        <div id="appContent">
            <h1>Simplest dApp on CKB <a href="https://github.com/liusong1111/simplestdapp" target="_blank">(Source
                Code)</a></h1>
            <form>
                <fieldset>
                    <div class="row">
                        <label for="private_key">
                            Please input test private key:
                        </label>
                        <input id="private_key" v-model="privateKey"/> &nbsp;
                        <button @click.prevent="reload">Confirm</button>
                    </div>
                    <div class="row">
                        <label for="address">
                            Your testnet address:
                        </label>
                        <input id="address" disabled :value="address"/>
                    </div>
                    <div class="row">
                        <label for="balance">
                            Testnet balance:
                        </label>
                        <input id="balance" :value="formatCkb(summary.free)" disabled/> &nbsp;
                        <a href="https://faucet.nervos.org/" target="_blank">get more...</a>
                    </div>
                </fieldset>
            </form>
            <div class="cells">
                <h3>Data cell list
                    &nbsp;<button @click.prevent="newCell()">Create Cell</button>
                    &nbsp;<button @click.prevent="reload()">Refresh{{loading && "ing.." || ""}}</button>
                    &nbsp;<button @click.prevent="getAuth()">getAuth</button>
                </h3>
                <div v-if="!filledCells" class="no-data">
                    No Data Cells
                </div>
                <div>
                    <div class="cell" v-for="cell in filledCells" :key="cell.out_point.tx_hash + cell.out_point.index">
                        <div class="cell-header">
                            Capacity: {{formatCkb(cell.output.capacity)}}
                            <div class="cell-ops">
                                <a href="#" @click.prevent="deleteCell(cell)">Delete</a>
                                &nbsp;&nbsp;<a href="#" @click.prevent="editCell(cell)">Update</a>
                            </div>
                        </div>
                        <div class="cell-body">
                            Data:
                            {{hexToText(cell.output_data)}}
                        </div>
                    </div>
                </div>
            </div>
            <div id="model" :class="{hidden: !this.showModel}">
                <div class="model-content">
                    <h3>Input Data Content</h3>
                    <div>
                        <textarea v-model="editData" placeholder="content in hex-string format"></textarea>
                    </div>
                    <div>
                        <button @click.prevent="cancelModel()">Cancel</button>
                        <button @click.prevent="submitModel()" style="float:right">Confirm</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

</template>

<script>
    import * as BN from "bn.js";
    import {
        hexToBytes,
        privateKeyToPublicKey,
        pubkeyToAddress,
        blake160,
        utf8ToBytes,
        bytesToHex,
        hexToUtf8,
        scriptToHash,
    } from "@nervosnetwork/ckb-sdk-utils";
    // import CKB from "@nervosnetwork/ckb-sdk-core";
    // import { RpcService } from "./services";
    import {KeyperingService} from "./services";

    export default {
        name: 'App',
        data: function () {
            return {
                privateKey: "ebb14eeac1cedbaafc8af65d7ea0aa5042b8f8a88fc056b3e71e2c2975a0bd8a",
                publicKey: "",
                address: "",
                toLock: undefined,
                lockArg: undefined,
                lockHash: undefined,
                cells: [],
                emptyCells: [],
                filledCells: [],
                summary: {
                    inuse: 0,
                    free: 0,
                    capacity: 0,
                },
                showModel: false,
                mode: undefined,
                editData: "",
                loading: false,
                service: null,
            }
        },
        components: {},
        methods: {
            reload: async function () {
                this.loading = true
                // this.service = new RpcService(`0x${this.privateKey}`);
                this.service = new KeyperingService("ws://localhost:3012");
                this.publicKey = privateKeyToPublicKey(`0x${this.privateKey}`)
                this.address = pubkeyToAddress(this.publicKey, {
                    // "ckb" for mainnet, "ckt" for testnet
                    prefix: "ckt"
                })
                this.lockArg = `0x${blake160(this.publicKey, 'hex')}`

                this.toLock = {
                    // SECP256K1_BLAKE160_SIGHASH_ALL_TYPE_HASH, fixed
                    codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
                    hashType: "type",
                    args: this.lockArg,
                }
                this.lockHash = scriptToHash(this.toLock);
                try {
                    this.cells = await this.getCells(this.lockArg)
                } catch (e) {
                    alert("error:" + e)
                    console.log(e)
                }
                this.loading = false
                this.summary = this.getSummary(this.cells)
                console.log("summary:", this.summary)
                const {emptyCells, filledCells} = this.groupCells(this.cells)
                this.emptyCells = emptyCells
                this.filledCells = filledCells
            },
            getAuth: async function () {
                const result = await this.service.requestAuth({
                    origin: "http://hello.com",
                    description: "hello"
                })
                console.log("getAuth result:" + result)
            },
            formatCkb: function (c) {
                if (typeof (c) === "undefined") {
                    return undefined
                }
                let fraction = c % 100000000
                fraction = fraction.toString().padStart(8, "0")
                let integer = Math.floor(c / 100000000)
                const format = new Intl.NumberFormat({useGrouping: true})
                integer = format.format(integer)
                return integer + "." + fraction
            },
            cancelModel: function () {
                this.showModel = false
            },
            newCell: function () {
                this.showModel = true
                this.editData = ""
                this.mode = "create"
                this.currentCell = null;
            },
            editCell: function (cell) {
                this.showModel = true
                this.editData = this.hexToText(cell.output_data)
                this.mode = "update"
                this.currentCell = cell;
            },
            submitModel: function () {
                this.opCell()
            },
            deleteCell: function (cell) {
                if (!confirm("Are you sure to delete this cell?")) {
                    return
                }
                this.editData = ""
                this.mode = "delete"
                this.currentCell = cell
                this.opCell()
            },
            getRawTxTemplate: function () {
                return {
                    version: "0x0",
                    cellDeps: [{
                        outPoint: {
                            // a fixed value for testnet
                            txHash: "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
                            index: "0x0"
                        },
                        depType: "depGroup",
                    }],
                    headerDeps: [],
                    inputs: [],
                    outputs: [],
                    witnesses: [],
                    outputsData: []
                }
            },
            textToHex: function (text) {
                let result = text.trim()
                if (result.startsWith("0x")) {
                    return result
                }
                const bytes = utf8ToBytes(result)
                result = bytesToHex(bytes)
                return result
            },
            hexToText: function (hex) {
                let result = hex.trim()
                try {
                    result = hexToUtf8(result)
                    let isAscii = true
                    for (let i = 0; i < result.length; i++) {
                        if (result.charCodeAt(i) > 255) {
                            isAscii = false
                            break
                        }
                    }
                    if (isAscii) {
                        return result
                    } else {
                        return hex.trim()
                    }
                } catch (e) {
                    console.log("hexToUtf8 error:", e, "fallback to hex")
                }
                return result
            },
            opCell: async function () {
                const rawTx = this.getRawTxTemplate()
                let total = new BN(0)

                if (this.mode === "create" || this.mode === "update") {
                    const editData = this.textToHex(this.editData)
                    let bytes = hexToBytes(editData)
                    let byteLength = bytes.byteLength
                    let capacity = new BN(byteLength * 100000000)
                    // State Rent
                    capacity = capacity.add(new BN("6100000000"))

                    // add Transaction Fee
                    total = capacity.add(new BN("10000000"))

                    rawTx.outputs.push({
                        capacity: `0x${capacity.toString(16)}`,
                        lock: this.toLock,
                    })
                    rawTx.outputsData.push(editData)
                } else {
                    total = new BN("10000000")
                }

                let cells = this.emptyCells;
                let inputCapacity = new BN(0);
                let ok = false
                if (this.mode === "update" || this.mode === "delete") {
                    cells = [this.currentCell, ...cells]
                }
                for (let cell of cells) {
                    rawTx.inputs.push({
                        previousOutput: {
                            txHash: cell.out_point.tx_hash,
                            index: cell.out_point.index,
                        },
                        since: "0x0",
                    })
                    rawTx.witnesses.push("0x")
                    let cellCapacity = new BN(parseInt(cell.output.capacity))
                    inputCapacity = inputCapacity.add(cellCapacity)
                    if (inputCapacity.gt(total)) {
                        if (inputCapacity.sub(total).gt(new BN("6100000000"))) {
                            const change = inputCapacity.sub(total)
                            rawTx.outputs.push({
                                capacity: `0x${change.toString(16)}`,
                                lock: this.toLock,
                            })
                            rawTx.outputsData.push("0x")
                        }
                        ok = true
                        break
                    }
                }
                if (!ok) {
                    alert("You have not enough CKB!")
                    return
                }
                rawTx.witnesses[0] = {
                    lock: "",
                    inputType: "",
                    outputType: "",
                }
                //sign
                // const ckb = new CKB("https://prototype.ckbapp.dev/testnet/rpc")
                // const signedTx = ckb.signTransaction(`0x${this.privateKey}`)(rawTx)
                this.loading = true
                // const signedTx = await this.service.signTransaction(rawTx, "hello")
                // console.log("signedTx:", JSON.stringify(signedTx, null, "  "))
                // try {
                //     // await ckb.rpc.sendTransaction(signedTx)
                //     await this.service?.sendTransaction(signedTx)
                //     setTimeout(() => {
                //         alert("Tx has been broadcasted, please refresh later. Typical block interval is 8~30s")
                //     }, 0)
                // } catch (e) {
                //     console.log("sendTransaction error:", e)
                //     alert("error:", e)
                // }
                const signedTx = await this.service.signAndSendTransaction({tx: rawTx, meta: "hello", target: {lockHash: this.lockHash}})
                alert("Tx has been broadcasted, please refresh later. Typical block interval is 8~30s")
                this.loading = false
                this.showModel = false
                setTimeout(() => {
                    this.reload()
                }, 1000)
            },
            getCells: async function (lockArg) {
                let a = 2;
                // for test only
                if (a === 1) {
                    let response =
                        {
                            "jsonrpc": "2.0",
                            "result": {
                                "last_cursor": "0x409bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce80114000000705ca2e725e9b26e6abb842ed2043ea80197dfd7000000000000300e0000000100000001",
                                "objects": [
                                    {
                                        "block_number": "0x2f62",
                                        "out_point": {
                                            "index": "0x0",
                                            "tx_hash": "0x2d6e2f573be0527baa28cd2fc1d36ffeabd6a9fc9145f9aed1b26a11bd794bcd"
                                        },
                                        "output": {
                                            "capacity": "0x177825f00",
                                            "lock": {
                                                "args": "0x705ca2e725e9b26e6abb842ed2043ea80197dfd7",
                                                "code_hash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
                                                "hash_type": "type"
                                            },
                                            "type": null
                                        },
                                        "output_data": "0xc3d4",
                                        "tx_index": "0x1"
                                    },
                                    {
                                        "block_number": "0x300e",
                                        "out_point": {
                                            "index": "0x0",
                                            "tx_hash": "0x501f0f0bb8715fc4fa1ad46485775cc67855908a718265bce8926fd602b3c756"
                                        },
                                        "output": {
                                            "capacity": "0x1836e2100",
                                            "lock": {
                                                "args": "0x705ca2e725e9b26e6abb842ed2043ea80197dfd7",
                                                "code_hash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
                                                "hash_type": "type"
                                            },
                                            "type": null
                                        },
                                        "output_data": "0x12345678",
                                        "tx_index": "0x1"
                                    },
                                    {
                                        "block_number": "0x300e",
                                        "out_point": {
                                            "index": "0x1",
                                            "tx_hash": "0x501f0f0bb8715fc4fa1ad46485775cc67855908a718265bce8926fd602b3c756"
                                        },
                                        "output": {
                                            "capacity": "0x716f61f090",
                                            "lock": {
                                                "args": "0x705ca2e725e9b26e6abb842ed2043ea80197dfd7",
                                                "code_hash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
                                                "hash_type": "type"
                                            },
                                            "type": null
                                        },
                                        "output_data": "0x",
                                        "tx_index": "0x1"
                                    }
                                ]
                            },
                            "id": 2
                        }
                    return response.result.objects;
                }
                this.loading = true
                let payload = {
                    "id": 2,
                    "jsonrpc": "2.0",
                    "method": "get_cells",
                    "params": [
                        {
                            "script": {
                                "code_hash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
                                "hash_type": "type",
                                "args": lockArg,
                            },
                            "script_type": "lock"
                        },
                        "asc",
                        // "0x6"
                        // "0x64"
                        "0x2710"
                    ]
                }
                const body = JSON.stringify(payload, null, "  ")
                console.log("get_cells request:", body)
                // let url = "http://localhost:8117/indexer"
                let url = "https://prototype.ckbapp.dev/testnet/indexer"
                try {
                    let res = await fetch(url, {
                        method: "POST",
                        body,
                        cache: "no-store",
                        headers: {
                            // "Accept": "application/json",
                            "Content-Type": "application/json",
                            // "Content-Type": "text/plain",
                            // "Origin": "http://localhost:8080",
                            // "Access-Control-Allow-Origin": "*",
                            // "Access-Control-Request-Method": "POST",
                            // "Access-Control-Request-Headers": "content-type"
                        },
                        mode: "cors",
                    })
                    // res = await res.text()
                    res = await res.json()
                    // res = await res.text()
                    console.log("get_cells response:", res)
                    return res.result.objects
                } catch (e) {
                    console.log("error:", e)
                    alert("error:" + e)
                }
                this.loading = false
            },
            groupCells: function (cells) {
                let emptyCells = [];
                let filledCells = [];
                for (let cell of cells) {
                    if (cell.output_data === "0x") {
                        emptyCells.push(cell)
                    } else {
                        filledCells.push(cell)
                    }
                }
                return {
                    emptyCells,
                    filledCells,
                }
            },
            getSummary: function (cells) {
                let capacity = 0
                let inuse = 0
                let free = 0
                for (let cell of cells) {
                    const _capacity = parseInt(cell.output.capacity)
                    capacity += _capacity

                    if (cell.output_data === "0x") {
                        free += _capacity
                    } else {
                        inuse += _capacity
                    }
                }
                return {
                    inuse,
                    capacity,
                    free,
                }
            },
        }
    }
</script>

<style>
    #app {
        font-family: Avenir, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        width: 100%;
    }

    #appContent {
        width: 800px;
        margin: auto;
    }

    h1, h3 {
        text-align: center;
    }

    fieldset {
        display: table;
    }

    .row {
        display: table-row;
    }

    label {
        display: table-cell;
        padding: 8px;
        text-align: right;
    }

    input {
        width: 35em;
    }

    .no-data {
        background-color: #f0f0f0;
        padding: 20px;
        text-align: center;
    }

    .cell {
        margin: 8px;
        padding: 8px;
        border: 1px solid #ccc;
        background-color: #f0f0f0;
    }

    .cell-header {
        padding: 8px;
    }

    .cell-ops {
        float: right;
    }

    .cell-body {
        background-color: #fff;
        padding: 8px;
    }

    .hidden {
        display: none;
    }

    #model {
        position: absolute;
        z-index: 2;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(128, 128, 128, 0.2);
    }

    #model .model-content {
        position: relative;
        top: 300px;
        margin: auto;
        width: 50em;
        background-color: #ccc;
        padding: 0 20px 20px 20px;
        border: 1px solid #999;
    }

    #model textarea {
        width: 100%;
        height: 10em;
    }


</style>
