<template>
    <div id="app">
        <h1>Simplest dApp on CKB</h1>
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
                &nbsp;<button @click.prevent="reload()">Refresh</button>
            </h3>
            <div v-if="!filledCells" class="no-data">
                No Data Cells
            </div>
            <div>
                <div class="cell" v-for="cell in filledCells" :key="cell.block_number">
                    <div class="cell-header">
                        Capacity: {{formatCkb(cell.output.capacity)}}
                        <div class="cell-ops">
                            <a href="#" @click.prevent="deleteCell(cell)">Delete</a>
                            &nbsp;&nbsp;<a href="#" @click.prevent="editCell(cell)">Update</a>
                        </div>
                    </div>
                    <div class="cell-body">
                        Data In Hex String Format:
                        {{cell.output_data}}
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

</template>

<script>
    import * as BN from "bn.js";
    import {
        hexToBytes,
        privateKeyToPublicKey,
        pubkeyToAddress,
        blake160,
    } from "@nervosnetwork/ckb-sdk-utils";
    import CKB from "@nervosnetwork/ckb-sdk-core";

    export default {
        name: 'App',
        data: function () {
            return {
                // privateKey: "",
                // todo:
                privateKey: "ebb14eeac1cedbaafc8af65d7ea0aa5042b8f8a88fc056b3e71e2c2975a0bd8a",
                publicKey: "",
                address: "",
                toLock: undefined,
                lockArg: undefined,
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
            }
        },
        components: {},
        methods: {
            reload: async function () {
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
                this.cells = await this.getCells(this.lockArg)
                this.summary = this.getSummary(this.cells)
                console.log("summary:", this.summary)
                const {emptyCells, filledCells} = this.groupCells(this.cells)
                this.emptyCells = emptyCells
                this.filledCells = filledCells
                //todo: test only
                this.filledCells = this.cells;
                console.log("emptyCells:", this.emptyCells)
            },
            formatCkb: function (c) {
                if (typeof (c) === "undefined") {
                    return undefined
                }
                let fraction = c % 100000000
                fraction = fraction.toString().padStart(8, "0")
                let integer = c / 100000000
                const format = new Intl.NumberFormat({useGrouping: true})
                integer = format.format(integer)
                return integer + "." + fraction
            },
            cancelModel: function () {
                this.showModel = false
            },
            newCell: function () {
                this.showModel = true
                this.editData = "d1"
                this.mode = "create"
                this.currentCell = null;
            },
            editCell: function (cell) {
                this.showModel = true
                this.editData = ""
                this.mode = "update"
                this.currentCell = cell;
            },
            submitModel: function () {
                this.opCell()
            },
            deleteCell: function (cell) {
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
            opCell: async function () {
                const rawTx = this.getRawTxTemplate()
                let total = new BN(0)

                if (this.mode === "create" || this.mode === "update") {
                    const editData = `0x${this.editData}`
                    let bytes = hexToBytes(editData)
                    let byteLength = bytes.byteLength
                    let capacity = new BN(byteLength * 100000000)
                    // State Rent
                    capacity = capacity.add(new BN("6100000000"))

                    // add Transaction Fee
                    total = capacity.add(new BN("1000"))

                    rawTx.outputs.push({
                        capacity: `0x${capacity.toString(16)}`,
                        lock: this.toLock,
                    })
                    rawTx.outputsData.push(editData)
                } else {
                    total = new BN("1000")
                }

                let cells = this.emptyCells;
                console.log("cells:", cells)
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
                            console.log("get change:", change.toString())
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
                const ckb = new CKB("https://prototype.ckbapp.dev/testnet/rpc")
                const signedTx = ckb.signTransaction(`0x${this.privateKey}`)(rawTx)
                console.log("signedTx:", JSON.stringify(signedTx))
                try {
                    await ckb.rpc.sendTransaction(signedTx)
                } catch (e) {
                    console.log("sendTransaction error:", e)
                }
            },
            getCells: async function (lockArg) {
                let a = 1;
                if (a == 1) {
                    let response = {
                        "jsonrpc": "2.0",
                        "result": {
                            "last_cursor": "0x409bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce80114000000705ca2e725e9b26e6abb842ed2043ea80197dfd70000000000001fbf0000000100000000",
                            "objects": [
                                {
                                    "block_number": "0x1fbf",
                                    "out_point": {
                                        "index": "0x0",
                                        "tx_hash": "0xaf81c2d0a2d903a22095259d3ad34183bbde8e1634a3ee22ace605198f36e5a0"
                                    },
                                    "output": {
                                        "capacity": "0x746a528800",
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
                console.log("request body:", body)
                //todo: testnet indexer
                let url = "http://localhost:8117/indexer"
                let res = await fetch(url, {
                    method: "POST",
                    body,
                    headers: {
                        "Accept": "application/json",
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
                console.log(res)
                return res.result.objects
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
                let capacity = 0;
                let inuse = 0;
                for (let cell of cells) {
                    const bytes = hexToBytes(cell.output_data)
                    const _inuse = bytes.byteLength * 100000000
                    inuse += _inuse

                    const _capacity = parseInt(cell.output.capacity)
                    capacity += _capacity
                }
                let free = capacity - inuse
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
        width: 800px;
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
        position: absolute;
        top: 300px;
        left: 100px;
        background-color: #ccc;
        padding: 0 20px 20px 20px;
        border: 1px solid #999;
    }

    #model textarea {
        width: 40em;
        height: 10em;
    }


</style>
