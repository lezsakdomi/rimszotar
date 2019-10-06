const express = require('express')
const expressVue = require('express-vue')
const bodyParser = require('body-parser')
const fs = require("fs")
const readline = require("readline")
const mm = require("micromatch")
const {PCRE2JIT} = require('pcre2')

const vowels = "a e i o u".split(' ')
const consonants = "b c cs d dz dzs f g gy h j k l ly m n ny p q r s sz t ty v w x y z zs".split(' ')
const abc = []
for (let letter of vowels) {
    abc.push({
        letter,
        vowel: true,
    })
}
for (let letter of consonants) {
    abc.push({
        letter,
        vowel: false,
    })
}

const app = express()
module.exports.app = app

app.use(bodyParser.urlencoded({}))
app.use(bodyParser.json())

expressVue.use(app).then(() => {
    app.get('/', (req, res) => {
        res.renderVue('index.vue')
    })
}).then(() => {
    return app.listen(process.env.PORT || 3000)
}).then(server => {
    console.log("App is listening on %o", server.address())
})

const apiRouter = express.Router()
app.use('/api', apiRouter)

const pcreDefines = `(?(DEFINE)
    (?'msh'b|c(?!s)|cs|d(?!z)|dz(?!s)|dzs|f|g(?!y)|gy|h|j|k|l(?!y)|ly|m|n(?!y)|ny|p|q|r|s(?!z)|t|v|w|x|y|z(?!s)|zs)
    (?'mghu'a|e|i|o|ö|u|ü)
    (?'mghl'á|é|í|ó|ő|ú|ű)
    (?'mgh'(?P>mghu)|(?P>mghl))
    (?'h'(?P>msh)|(?P>mgh))
    (?'sztu'(?P>mghu)(?P>msh)?(?=(?P>mgh)|$))
    (?'sztl'((?>mgh)(?>msh){2,}|(?>mghl)(?>msh)*)(?=(?P>mghu)|$))
)`

apiRouter.post('/words', async (req, res, next) => {
    try {
        const {dictionary = "", filters = []} = req.body

        for (let i in filters) {
            const filter = filters[i]

            switch (filter.type) {
                case "pattern":
                    filters[i] = getPatternMatcher(filter)
                    break

                case "rhythm":
                    filters[i] = (f => word => {

                        const rhythm = getRhythm(word)

                        return f(rhythm.toLowerCase()) || f(rhythm.toUpperCase())

                    })(getPatternMatcher(filter))
                    break

                case "regex":
                    filters[i] = (re => s => re.match(s))(new PCRE2JIT(pcreDefines +
                        filter.pattern
                            .replace(/%\((\w+)\)/g, '(?P>$1)')
                            .replace(/%(\w+)/g, '(?P>$1)')
                        , filter.flags))
                    break

                default:
                    res.status(400).end(`The type of ${1 + Number(i)}th filter (${filter.type}) is not recognized`)
                    return
            }

            function getPatternMatcher(filter) {
                return mm.matcher(filter.pattern, filter)
            }

            function getRhythm(word) {
                word = word.replace(/&\w+;/g, '')
                    .normalize('NFKD')
                    .replace("ł", "l")
                    .replace("Ł", "L")
                    .toLowerCase()

                const letters = []
                let letter = beginLetter(letters, 0)

                for (let i = 0; i < word.length; i++) {

                    const character = word.charAt(i)
                    const charCode = word.charCodeAt(i)

                    if (character.match(/['0-9()!,+ .-]/)) {

                        if (letter.characters.length) {
                            finalizeLetter(letter)
                            letter = beginLetter(letters, i + 1)
                        } else {
                            letter.begin = i + 1
                        }

                        continue

                    } else if (character.match(/[a-z]/)) {

                        const newCharacters = letter.characters + character

                        if (abc.some(({letter}) => letter.startsWith(newCharacters))) {
                            letter.characters = newCharacters
                        } else {
                            finalizeLetter(letter)
                            letter = beginLetter(letters, i, character)
                        }

                    } else if (0x0300 <= charCode && charCode <= 0x0370) { // combining marks

                        letter.diacritics += character

                    } else {

                        throw new Error(`Failed to process character 0x${charCode.toString(16)} ('${character}')`)

                    }

                    letter.end = i
                }

                if (letter.characters.length === 0) {
                    letters.pop()
                } else {
                    finalizeLetter(letter, word.length)
                }


                let rhythm = "u"

                {
                    let wasConsonant = false
                    for (let letter of letters) {
                        if (letter.vowel) {
                            if (letter.long) {
                                rhythm += '-'
                            } else {
                                rhythm += 'u'
                            }

                            wasConsonant = false
                        } else {
                            if (wasConsonant) {
                                rhythm[rhythm.length - 1] = '-'
                            }

                            wasConsonant = true
                        }
                    }
                }

                return rhythm.slice(1)


                function beginLetter(letters, position, characters = "") {

                    letters.push({
                        characters,
                        diacritics: [],
                        begin: position,
                        end: position,
                    })

                    return letters[letters.length - 1]
                }

                function finalizeLetter(letter) {
                    letter.vowel = abc.find(abcLetter => abcLetter.letter === letter.characters).vowel

                    if (letter.vowel) {
                        if ([...letter.diacritics].some(Array.prototype.includes.bind([
                            '\u0300', // COMBINING GRAVE ACCENT
                            '\u0301', // COMBINING ACUTE ACCENT
                            '\u0302', // COMBINING CIRCUMFLEX
                            '\u0303', // COMBINING TILDE
                            '\u030B', // COMBINING DOUBLE ACUTE ACCENT
                            '\u030D', // COMBINING VERTICAL LINE ABOVE
                            '\u030E', // COMBINING DOUBLE VERTICAL LINE ABOVE
                            '\u030F', // COMBINING DOUBLE GRAVE ACCENT
                        ]))) {
                            letter.long = true
                        }
                    }
                }
            }
        }

        if (dictionary.match(/\.\./)) {
            res.status(403).end("Invalid dictionary")
            return
        }

        const dictionaryPath = `dictionaries/${dictionary}/`
        if (await fs.promises.access(dictionaryPath, fs.constants.R_OK).then(() => false, () => true)) {
            res.status(404).end("Given dictionary is not accessible")
            return
        }

        const wordlist = await fs.promises.readdir(dictionaryPath)
            .then(files => files.find(file => file.match(/\.wordlist$/)))

        const wordlistPath = `dictionaries/${dictionary}/${wordlist}`
        if (await fs.promises.access(wordlistPath, fs.constants.R_OK).then(() => false, () => true)) {
            res.status(404).end("Wordlist for given dictionary is not accessible")
            return
        }

        const words = []
        const rl = readline.createInterface({
            input: fs.createReadStream(wordlistPath, 'utf8'),
        })

        for await (let line of rl) {
            // unmunch fails
            if (line.match(/^\w+:[^\s]/)) continue
            if (line.match(/^:/)) continue
            if (line.match(/\w+}$/)) continue
            if (line.match(/\w+\*$/)) continue

            // unwanted "words"
            if (line.match(/^[[\]#-](?=\t|$)/)) continue
            if (line.match(/^%/)) continue
            if (line.match(/\bpo:punct\b/)) continue

            const matches = /^[^\/\s](?:[ -]?[^\/\s]\.?)*/.exec(line)
            if (!matches) continue
            let [word] = matches

            word = word.replace(/''/g, "'")

            if (filters.every(f => f(word))) {
                words.push(word)
            }
        }

        res.header('Content-Type', "application/json")
        res.end(JSON.stringify({dictionary, wordlist, words}))
    } catch (e) {
        console.error(e)
        next(e)
    }
})

apiRouter.get('/dictionaries', (req, res, next) => {
    fs.readdir('dictionaries', {withFileTypes: true}, (err, files) => {
        if (err) {
            next(err)
        } else {
            Promise.all(files
                .filter(file => file.isDirectory())
                .map(file => fs.promises.readFile(`dictionaries/${file.name}/LEIRAS.txt`, 'utf8') // todo latin2
                    .catch(() => "")
                    .then(leiras => {
                        const details = {}

                        let k, v
                        for (let line of leiras.split('\n')) {
                            if (!line.length) break

                            if (line.match(/^.+: /)) {
                                [k, v] = line.split(": ", 2)
                            } else {
                                v = line
                            }

                            if (details.hasOwnProperty(k)) {
                                details[k] += '\n' + v
                            } else {
                                details[k] = v
                            }
                        }

                        return {[file.name]: details}
                    }),
                ),
            ).then(
                a => a.reduce((a, v) => Object.assign(a, v), {}),
            ).then(dictionaries => {
                res.send({dictionaries})
            }, next)
        }
    })
})
