<template>
    <div id="main">

        <h1>Word lookup</h1>

        <article id="form">

            <label>Dictionary:</label>
            <select v-if="dictionaries" v-model="formData.dictionary" title="Dictionary" @keypress="handleKeypress">
                <option value="">Default</option>
                <option v-for="dictionary of Object.keys(dictionaries)" :value="dictionary">
                    {{ dictionaries[dictionary]['Név'] || dictionary }}
                </option>
            </select>
            <input v-else v-model="formData.dictionary" title="Dictionary" @keypress="handleKeypress"/>

            <p v-if="selectedDictionary['Szavak száma']">
                <b>{{ selectedDictionary['Szavak száma'] }}</b> words in the dictionary
            </p>

            <p v-if="selectedDictionary['Felelős']">
                Credits to
                <a v-if="selectedDictionary['Felelős'].match(/^([^<>]*) <([^<>]*@[^<>]*)>$/)"
                   v-text="/^([^<>]*) <([^<>]*@[^<>]*)>$/.exec(selectedDictionary['Felelős'])[1]"
                   :href="/^([^<>]*) <([^<>]*@[^<>]*)>$/.exec(selectedDictionary['Felelős'])[2]"/>
                <i v-else>{{ selectedDictionary['Felelős'] }}</i>.
            </p>

            <p v-if="selectedDictionary['Forrás']">
                Source: <i>{{ selectedDictionary['Forrás'] }}</i>.
            </p>

            <p v-if="selectedDictionary['Leírás']">
                {{ selectedDictionary['Leírás'] }}
            </p>

            <pre v-if="selectedDictionary['Megjegyzés']" v-text="selectedDictionary['Megjegyzés']"/>

            <h2>Filters:</h2>
            <div v-for="filter in formData.filters" class="filter">

                <div class="filter-control">

                    <select v-model="filter.type" title="Filter" @keypress="handleKeypress">
                        <option value="" disabled>Filter type</option>
                        <option value="pattern">Word</option>
                        <option value="rhythm">Rhythm</option>
                        <option value="regex">RegExp</option>
                    </select>

                    <button @click="removeFilter($event, filter)">x Remove</button>

                </div>


                <input v-if="['pattern', 'rhythm', 'regex'].includes(filter.type)" placeholder="Pattern"
                       v-model="filter.pattern" @keypress="handleKeypress"/>

                <info v-if="['rhythm'].includes(filter.type)">
                    Use either '-uu' or '-UU' forms
                </info>

                <info v-if="['pattern', 'rhythm'].includes(filter.type)">
                    You can use advanced patterns here.
                </info>


                <input v-if="['regex'].includes(filter.type)" placeholder="Flags" v-model="filter.flags"
                       @keypress="handleKeypress"/>

                <p v-if="filter.type === 'pattern'" class="info">
                    You can use wildcard characters like <code>*</code> or <code>?</code> to find your word. Note that
                    ? counts for a character and not for a letter.
                    <a href="https://github.com/micromatch/micromatch/blob/master/README.md#matching-features">
                        See this technical documentation for full reference.</a>
                </p>

                <p v-if="filter.type === 'rhythm'" class="info">
                    To find a word ending either with a spondee or a pyrrhic, enter <code>*{--,uu}</code>.
                </p>

                <p v-if="filter.type === 'regex'" class="info">
                    Full <a href="https://www.pcre.org/current/doc/html/pcre2pattern.html">PCRE</a> support for you.<br>
                    Predefined functions: msh, mgh, h, szt, mshu, mshl, sztu, sztl<br>
                    Syntactic sugar: Use <code>%func</code> to call them.
                </p>

            </div>

            <button @click="addFilter">+ New filter</button>

            <button @click="send" v-if="!loading">List words</button>
        </article>

        <main v-if="loading">

            <i>Loading...</i>

        </main>

        <main v-else-if="error">

            <h3>Error</h3>

            <p>{{ error.message }}</p>

            <div v-if="error.stack">
                Occurred at:<br/>
                <pre>{{ error.stack }}</pre>
            </div>

            <iframe v-if="response && responseText" id="errorResponse" v-bind:src="responseSrc"></iframe>

        </main>

        <main v-else-if="responseJson">

            <h2>Results:</h2>

            <i>{{ responseJson.words.length }} words found</i>

            <p>
                <span v-for="word of responseJson.words" class="word">{{ word }}</span>
            </p>

        </main>

    </div>
</template>

<script>
    import Info from "../info"

    export default {

        components: {Info},

        data: () => ({
            formData: {
                dictionary: "",
                filters: [],
            },
            loading: false,
            error: null,
            response: null,
            responseJson: null,
            responseText: null,
            dictionaries: null,
        }),

        methods: {

            addFilter(event) {

                this.formData.filters.push({type: "", id: this.formData.filters.length})

                if (event) event.preventDefault()
            },

            removeFilter(event, filter) {

                // we need to call event.preventDefault() because of the early return in the loop
                if (event) event.preventDefault()

                for (let i in this.formData.filters) {
                    const filter_ = this.formData.filters[i]
                    if (filter_ === filter) {
                        this.formData.filters.splice(i, 1)
                        return
                    }
                }

                throw new Error("The provided filter was not found")
            },

            send(event) {

                this.loading = true
                this.error = null
                this.response = null
                this.responseJson = null
                this.responseText = null

                if (event) {
                    const params = new URLSearchParams
                    for (let [k, v] of Object.entries(this.formData)) {
                        params.set(k, JSON.stringify(v))
                    }

                    history.pushState({formData: this.formData}, "", "?" + params.toString())
                }

                fetch("/api/words", {
                    method: 'post',
                    cache: 'no-cache',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(this.formData),

                }).then(async response => {

                    this.response = response

                    this.responseText = await response.text().catch(() => "")

                    if (response.status === 200) {
                        return this.responseJson = JSON.parse(this.responseText)
                    } else {
                        throw new Error(`Server says: ${response.statusText}`)
                    }

                }).then(() => {

                    this.error = false

                }, e => {

                    console.error(e)

                    this.error = e

                }).then(() => {

                    this.loading = false

                })

                if (event) event.preventDefault()
            },

            handleKeypress(event) {

                if (event.key === 'Enter') {
                    this.send(event)
                    // this.send handles event.preventDefault()
                }

            },
        },

        computed: {

            responseSrc() {

                if (this.response) {
                    const headers = this.response.headers
                    const mime = headers.has('Content-Type') ? headers.get('Content-Type') : 'text/plain'

                    return `data:${mime},${encodeURIComponent(this.responseText)}`
                } else {
                    return "about:blank"
                }

            },

            selectedDictionary() {
                return this.dictionaries && this.dictionaries[this.formData.dictionary] || {}
            },

        },

        mounted() {

            window.addEventListener('popstate', ({state}) => {
                for (let [k, v] of Object.entries(state)) {
                    this.$data[k] = v
                }
            })

            fetch("/api/dictionaries").then(async response => {

                this.response = response

                if (response.status === 200) {
                    return response.json()
                } else {
                    throw new Error(`Server says: ${response.statusText}`)
                }
            }).then(({dictionaries}) => {

                this.dictionaries = dictionaries

            }).catch(console.error)


            const params = new URLSearchParams(location.search.slice(1))

            for (let [k, v] of params.entries()) {

                try {

                    this.formData[k] = JSON.parse(v)

                } catch (e) {

                    if (e instanceof SyntaxError) {
                        this.formData[k] = v
                    } else {
                        throw e
                    }

                }

            }

            if (this.formData.dictionary || this.formData.filters.length) {
                this.send()
            }
        },

        updated() {

            history.replaceState({
                formData: {...this.formData},
                error: this.error ? {
                    name: this.error.name,
                    message: this.error.message,
                    stack: this.error.stack,
                } : this.error,
                responseText: this.reponseText,
                responseJson: this.responseJson,
                response: JSON.parse(JSON.stringify(this.response)),
                loading: this.loading, // should be false
            }, "")

        },

    }
</script>

<style scoped>
    #main {
        background: whitesmoke;
    }

    .filter {
        margin: 1em;
        padding: 1em;
        border: dotted;
    }

    .filter-control {
        margin-bottom: 1em;
    }

    .filter-control > button {
        float: right;
    }

    iframe#errorResponse {
        width: 100%;
        border: none;
        height: calc(100vh - 400px)
    }

    .word {
        display: inline-block;
        background: white;
        margin: 5px;
        padding: 5px;
        box-shadow: 1px 1px 2px lightblue;
    }
</style>