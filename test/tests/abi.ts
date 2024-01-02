import {makeClient} from '@wharfkit/mock-data'
import {ABI, Name} from '@wharfkit/antelope'
import {assert} from 'chai'
import {ABICache} from '$lib'

const client = makeClient()

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
