/** The main loop's running turn, as the mod tracks it live. */
export type TurnRecord = {
  /** The turn's text rows, by row id, in order. */
  texts: string[]
  /** The answer: the turn's last text row, once the turn ended. */
  finalId: string | null
  isRunning: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'final-only': {
      /** Whether the highlight is on at all (`/final-only` flips it). */
      isOn: boolean
      /** The main loop's running turn, or the last one once it ended. */
      currentTurn: string
      /** Which live turn a text row belongs to, by the row's id. */
      textTurn: StateFamily<string>
      /** Each live turn's record, by turn id. */
      answerTurn: StateFamily<TurnRecord | null>
    }
  }
}
