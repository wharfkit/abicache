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
    // Keys whose cached ABI came only from merged partial (action-synthesized) ABIs and is not yet reconciled with chain.
    readonly partial: Set<string> = new Set()

    constructor(readonly client: APIClient) {}

    async getAbi(account: NameType): Promise<ABI> {
        const key = String(account)
        const record = this.cache.get(key)
        if (record && !this.partial.has(key)) {
            return record
        }
        let getAbi = this.pending.get(key)
        if (!getAbi) {
            getAbi = this.client.v1.chain.get_raw_abi(account)
            this.pending.set(key, getAbi)
        }
        const response = await getAbi
        this.pending.delete(key)
        if (response.abi) {
            const chainAbi = ABI.from(response.abi)
            const resolved = record ? ABICache.merge(chainAbi, record, chainAbi.version) : chainAbi
            this.cache.set(key, resolved)
            this.partial.delete(key)
            return resolved
        } else if (record) {
            return record
        } else {
            throw new Error(`ABI for ${key} could not be loaded.`)
        }
    }

    setAbi(account: NameType, abiDef: ABIDef, merge = false) {
        const key = String(account)
        const abi = ABI.from(abiDef)
        const existing = this.cache.get(key)
        if (merge && existing) {
            this.cache.set(key, ABICache.merge(existing, abi, abi.version))
        } else {
            this.cache.set(key, abi)
            if (merge) {
                this.partial.add(key)
            } else {
                this.partial.delete(key)
            }
        }
    }

    private static merge(base: ABI, addition: ABI, version: string): ABI {
        return ABI.from({
            action_results: mergeAndDeduplicate(base.action_results, addition.action_results),
            types: mergeAndDeduplicate(base.types, addition.types, 'new_type_name'),
            structs: mergeAndDeduplicate(base.structs, addition.structs),
            actions: mergeAndDeduplicate(base.actions, addition.actions),
            tables: mergeAndDeduplicate(base.tables, addition.tables),
            ricardian_clauses: mergeAndDeduplicate(
                base.ricardian_clauses,
                addition.ricardian_clauses,
                'id'
            ),
            variants: mergeAndDeduplicate(base.variants, addition.variants),
            version,
        })
    }
}

function mergeAndDeduplicate(array1, array2, byField = 'name') {
    return array2.reduce((acc: any[], current: any) => {
        if (!acc.some((obj: any) => String(obj[byField]) === String(current[byField]))) {
            acc.push(current)
        }
        return acc
    }, array1.slice())
}
