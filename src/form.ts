import { Terminal } from "@tuzig/xterm"

export type Fields = Array<{
    prompt:string,
    default?:string,
    values?:Array<string>,
    validator?:(field: string) => string,
    password?: boolean,
}>

export type Results = Array<string>

export class Form {

    field: string
    i: number
    e: HTMLElement
    reject: (value: Error) => void
    fields: Fields
    results: Results
    onKey: (ev: KeyboardEvent) => void
    static activeForm = null

    constructor(fields: Fields) {
        this.fields = fields
        this.onKey = null
    }

    static keyHandler(ev: Event) {
        if (Form.activeForm?.onKey)
            Form.activeForm.onKey(ev)
        else
            window.terminal7.map.t0.writeln("Nothing to do here... for now")
    }

    setActive(t) {
        if ((Form.activeForm instanceof Form) && (Form.activeForm != this)) {
            Form.activeForm.escape(t)
        }
        Form.activeForm = this
    }
    chooseFields(t: Terminal, title="") {
        t.scrollToBottom()
        this.setActive(t)
        const len = this.fields.length
        const enabled = new Array(len).fill(false)
        let current = 0
        return new Promise<Array<boolean>>((resolve, reject) => {
            this.reject = reject
            t.writeln(`  ${title}, choose fields to edit:`)
            t.writeln("  [Use ⇅ to move, space to select, → to all, ← to none]")
            t.writeln("  " + this.fields.map(f => `[ ] ${f.prompt}: ${f.default}`).join('\n  ') + "\x1B[s")
            t.write(`\x1B[4G\x1B[${len}A`) // move cursor to first field
            this.onKey = ev => {
                const key = ev.key
                const char = !enabled[current] ? 'X' : ' '
                switch (key) {
                    case "ArrowUp":
                        if (current > 0) {
                            current--
                            t.write("\x1B[A")
                        }
                        break
                    case "ArrowDown":
                        if (current < enabled.length - 1) {
                            current++
                            t.write("\x1B[B")
                        }
                        break
                    case " ":
                        enabled[current] = !enabled[current]
                        t.write(char + "\x1B[1D")
                        break
                    case "Enter":
                        this.fields = this.fields.filter((_, i) => enabled[i])
                        t.write(`\x1B[${len-current}B\n`)
                        Form.activeForm = null
                        resolve(enabled)
                        break
                    case "ArrowRight":
                        enabled.fill(true)
                        if (current != 0)
                            t.write(`\x1B[${current}A`) // move cursor to first field
						enabled.forEach(() => t.write("X\x1B[1D\x1B[1B"))
                        t.write(`\x1B[${len-current}A`) // restore cursor position
                        break
                    case "ArrowLeft":
                        enabled.fill(false)
                        if (current != 0)
                            t.write(`\x1B[${current}A`)
						enabled.forEach(() => t.write(" \x1B[1D\x1B[1B"))
                        t.write(`\x1B[${len-current}A`)
                        break
                }
            }
            t.focus()
        })
    }

    menu(t: Terminal) {
        t.scrollToBottom()
        this.setActive(t)
        const len = this.fields.length
        const enabled = new Array(len).fill(false)
        let current = 0
        return new Promise<string>((resolve, reject) => {
            this.reject = reject
            t.writeln("  [Use ⇅ to move, Enter to select]")
            t.writeln("  " + this.fields.map(f => `  ${f.prompt}`).join('\n  '))
            t.write(`\x1B[3G\x1B[${len}A`) // move cursor to first field
            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[3G`) // bold first field
            this.onKey = ev => {
                const key = ev.key
                switch (key) {
                    case "ArrowUp":
                        if (current > 0) {
                            t.write(`  ${this.fields[current].prompt}\x1B[3G`)
                            current--
                            t.write("\x1B[A")
                            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[3G`)
                        }
                        break
                    case "ArrowDown":
                        if (current < enabled.length - 1) {
                            t.write(`  ${this.fields[current].prompt}\x1B[3G`)
                            current++
                            t.write("\x1B[B")
                            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[3G`)
                        }
                        break
                    case "Enter":
                        resolve(this.fields[current].prompt)
                        t.write(`\x1B[${len-current}B\n`)
                        Form.activeForm = null
                        break
                }
            }
            setTimeout(() => t.focus(), 100)
        })
    }


    start(t: Terminal) : Promise<Results> {
        this.setActive(t)
        this.i = 0
        this.field = ''
        this.results = []
        t.scrollToBottom()
        return new Promise((resolve, reject) => {
            this.reject = reject
            this.writeCurrentField(t)
            setTimeout(() => t.focus(), 0)
            this.onKey  = ev => {
                const key = ev.key
                this.hidden = this.fields[this.i].password
                switch (key) {
                    case "Backspace":
                        if (this.field.length > 0) {
                            this.field = this.field.slice(0, -1)
                            if (!this.hidden)
                                t.write("\b \b")
                        }
                        break
                    case "Enter":
                        t.write("\n")
                        if (!this.next(t)) {
                            resolve(this.results)
                            Form.activeForm = null
                            return
                        }
                        break
                    default:
                        if (key.length == 1) { // make sure the key is a char
                            this.field += key
                            if (!this.hidden)
                                t.write(key)
                        }
                }
            }
            setTimeout(() => t.focus(), 0)
        })
    }

    // saves the current field and prints the next one
    // returns true if there are more fields to edit, false if done
    next(t: Terminal) {
        const current = this.fields[this.i]
        let valid = true
        if (!this.field && !current.default) {
            t.writeln("  Please enter a value")
            valid = false
        }
        else if (this.field && current.values && current.values.indexOf(this.field) == -1) {
            t.writeln(`  ${current.prompt} must be one of: ${current.values.join(', ')}`)
            valid = false
        }
        else if (this.field && current.validator) {
            const err = current.validator(this.field)
            if (err) {
                t.writeln(`  ${err}`)
                valid = false
            }
        }
        if (!valid) {
            this.field = ''
            this.writeCurrentField(t)
            return true
        }
        this.results.push(this.field || current.default || '')
        this.field = ''
        if (this.i < this.fields.length - 1) {
            this.i++
            this.writeCurrentField(t)
            return true
        }
        return false
    }

    writeCurrentField(t: Terminal) {
        const values = this.fields[this.i].values
        let def = this.fields[this.i].default
        if (values)
            def = values.map(v => v == def ? v.toUpperCase() : v).join('/')
        if (def)
            def = ` [${def}]`
        t.write(`  ${this.fields[this.i].prompt}${def || ''}: `)
    }

    shell(t: Terminal) {
        this.setActive(t)
        this.field = ''
        t.scrollToBottom()
        return new Promise((resolve, reject) => {
            this.reject = reject
            this.onKey  = ev => {
                const key = ev.key
                switch (key) {
                    case "Enter":
                        t.write("\n")
                        resolve(this.field)
                        Form.activeForm = null
                        break
                    case "Backspace":
                        if (this.field.length > 0) {
                            this.field = this.field.slice(0, -1)
                            t.write("\b \b")
                        }
                        break
                    default:
                        if (key.length == 1) { // make sure the key is a char
                            this.field += key
                            t.write(key)
                        }
                }
            }
            setTimeout(() => t.focus(), 0)
        })
    }

    escape(t: Terminal) {
        t.scrollToBottom()
        t.writeln("\n\nESC")
        Form.activeForm = null
        this.reject(new Error("aborted"))
    }
}
