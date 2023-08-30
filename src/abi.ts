import {ABI, ABIDef, API, APIClient, NameType} from '@wharfkit/antelope'
import {AbiProvider} from '@wharfkit/signing-request'

export interface ABICacheInterface extends AbiProvider {
    readonly cache: Map<string, ABI>
    readonly pending: Map<string, Promise<API.v1.GetRawAbiResponse>>
    getAbi(account: NameType): Promise<ABI>
    setAbi(account: NameType, abi: ABIDef, merge?: boolean): void
}

/**
 * Given an APIClient instance, this class provides an AbiProvider interface for retrieving and caching ABIs.
 */
export class ABICache implements ABICacheInterface {
    readonly cache: Map<string, ABI> = new Map()
    readonly pending: Map<string, Promise<API.v1.GetRawAbiResponse>> = new Map()

    constructor(readonly client: APIClient) {}

    async getAbi(account: NameType): Promise<ABI> {
        const key = String(account)
        let record = this.cache.get(key)
        if (!record) {
            let getAbi = this.pending.get(key)
            if (!getAbi) {
                getAbi = this.client.v1.chain.get_raw_abi(account)
                this.pending.set(key, getAbi)
            }
            const response = await getAbi
            this.pending.delete(key)
            if (response.abi) {
                record = ABI.from(response.abi)
                this.cache.set(key, record)
            } else {
                throw new Error(`ABI for ${key} could not be loaded.`)
            }
        }
        return record
    }

    setAbi(account: NameType, abiDef: ABIDef, merge = false) {
        const key = String(account)
        const abi = ABI.from(abiDef)
        const existing = this.cache.get(key)
        if (merge && existing) {
            this.cache.set(
                key,
                ABI.from({
                    types: [...existing.types, ...abi.types],
                    structs: [...existing.structs, ...abi.structs],
                    actions: [...existing.actions, ...abi.actions],
                    tables: [...existing.tables, ...abi.tables],
                    ricardian_clauses: [...existing.ricardian_clauses, ...abi.ricardian_clauses],
                    variants: [...existing.variants, ...abi.variants],
                })
            )
        } else {
            this.cache.set(key, abi)
        }
    }
}
