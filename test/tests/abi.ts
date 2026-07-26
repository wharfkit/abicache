import {makeClient} from '@wharfkit/mock-data'
import {ABI, APIClient, Action, Name, Struct} from '@wharfkit/antelope'
import {assert} from 'chai'
import {ABICache} from '$lib'

const client = makeClient()

// Typed action data built via `Action.from(data)` with no chain ABI synthesizes a single-action ABI.
@Struct.type('transfer')
class Transfer extends Struct {
    @Struct.field('name') declare from: Name
    @Struct.field('name') declare to: Name
    @Struct.field('asset') declare quantity: unknown
    @Struct.field('string') declare memo: string
}

suite('ABICache', function () {
    let abiCache = new ABICache(client)
    setup(function () {
        abiCache = new ABICache(client)
    })
    test('constructor', function () {
        assert.instanceOf(abiCache, ABICache)
    })
    test('fetches data', async function () {
        const result = await abiCache.getAbi(Name.from('eosio.token'))
        assert.instanceOf(result, ABI)
        assert.equal(result.version, 'eosio::abi/1.2')
    })
    test('caches data', async function () {
        await abiCache.getAbi(Name.from('eosio.evm'))
        assert.isTrue(abiCache.cache.has('eosio.evm'))
        await abiCache.getAbi(Name.from('eosio.token'))
        assert.isTrue(abiCache.cache.has('eosio.token'))
    })
    test('no duplicate data', async function () {
        await abiCache.getAbi(Name.from('eosio.token'))
        await abiCache.getAbi(Name.from('eosio.token'))
        assert.isTrue(abiCache.cache.has('eosio.token'))
        assert.equal(abiCache.cache.size, 1)
    })
    test('manually add abi', async function () {
        const abi = ABI.from({version: 'eosio::abi/1.2'})
        abiCache.setAbi('foo', abi)
        assert.equal(abiCache.cache.size, 1)
        assert.instanceOf(abiCache.cache.get('foo'), ABI)
        assert.equal(abi.version, 'eosio::abi/1.2')
        const result = await abiCache.getAbi(Name.from('foo'))
        assert.instanceOf(result, ABI)
        assert.equal(result.version, 'eosio::abi/1.2')
    })
    test('retries after a rejected fetch instead of caching the rejection', async function () {
        let calls = 0
        const flaky = {
            v1: {
                chain: {
                    get_raw_abi(account: Name) {
                        calls++
                        if (calls === 1) {
                            return Promise.reject(new Error('network error'))
                        }
                        return client.v1.chain.get_raw_abi(account)
                    },
                },
            },
        } as unknown as APIClient
        const cache = new ABICache(flaky)
        try {
            await cache.getAbi('eosio.token')
            assert.fail('expected first getAbi to reject')
        } catch (error) {
            assert.equal((error as Error).message, 'network error')
        }
        assert.equal(cache.pending.size, 0, 'rejected promise left in pending map')
        const result = await cache.getAbi('eosio.token')
        assert.instanceOf(result, ABI)
        assert.equal(calls, 2)
    })
    test('merge abis (eosio.token)', async function () {
        const abi = await abiCache.getAbi(Name.from('eosio.token'))
        abiCache.setAbi('eosio.token', abi, true)
        abiCache.setAbi('eosio.token', abi, true)
        abiCache.setAbi('eosio.token', abi, true)
        const test = await abiCache.getAbi('eosio.token')
        assert.equal(test.action_results.length, abi.action_results.length)
        assert.equal(test.actions.length, abi.actions.length)
        assert.equal(test.ricardian_clauses.length, abi.ricardian_clauses.length)
        assert.equal(test.structs.length, abi.structs.length)
        assert.equal(test.tables.length, abi.tables.length)
        assert.equal(test.types.length, abi.types.length)
        assert.equal(test.variants.length, abi.variants.length)
        assert.equal(test.version, abi.version)
        assert.equal(JSON.stringify(test), JSON.stringify(abi))
    })
    test('merge abis (eosio)', async function () {
        const raw = await client.v1.chain.get_abi('eosio')
        if (raw.abi) {
            const rawAbi = ABI.from(raw.abi)
            const abi = await abiCache.getAbi(Name.from('eosio'))
            assert.isTrue(rawAbi.equals(abi))
            abiCache.setAbi('eosio', abi, true)
            abiCache.setAbi('eosio', abi, true)
            abiCache.setAbi('eosio', abi, true)
            const test = await abiCache.getAbi('eosio')
            assert.equal(test.action_results.length, abi.action_results.length)
            assert.equal(test.actions.length, abi.actions.length)
            assert.equal(test.ricardian_clauses.length, abi.ricardian_clauses.length)
            assert.equal(test.structs.length, abi.structs.length)
            assert.equal(test.tables.length, abi.tables.length)
            assert.equal(test.types.length, abi.types.length)
            assert.equal(test.variants.length, abi.variants.length)
            assert.equal(test.version, abi.version)
            assert.equal(JSON.stringify(test), JSON.stringify(abi))
            assert.isTrue(rawAbi.equals(test))
        }
    })
})

suite('ABICache partial-ABI poisoning', function () {
    let abiCache = new ABICache(client)
    setup(function () {
        abiCache = new ABICache(client)
    })

    test('does not serve a partial (action-synthesized) ABI in place of the on-chain ABI', async function () {
        const action = Action.from({
            account: 'eosio.token',
            name: 'transfer',
            authorization: [],
            data: Transfer.from({from: 'alice', to: 'bob', quantity: '1.0000 WAX', memo: ''}),
        })
        const partial = action.abi as ABI

        // The synthesized ABI covers only `transfer`, not the rest of the contract.
        assert.equal(partial.actions.length, 1)
        assert.isUndefined(partial.getActionType('close'))

        // Session.getMergedAbiCache() does this for any action carrying an `.abi`; on an empty slot the partial is stored wholesale.
        abiCache.setAbi('eosio.token', partial, true)

        // A later resolve of a different action must see the full on-chain ABI, not the poisoned partial.
        const abi = await abiCache.getAbi(Name.from('eosio.token'))
        assert.isDefined(
            abi.getActionType('close'),
            'expected on-chain action `close` to resolve, but cache served a partial ABI'
        )
        assert.equal(abi.actions.length, 6)
    })
})
