# Kissa Shell Integration for Bash
# Injects OSC 133 semantic markers (A/B/C/D) to delimit command lifecycles.

__kissa_prompt_start() {
  printf '\033]133;A;%s\007' "$PWD"
}

__kissa_prompt_end() {
  printf '\033]133;B\007'
}

__kissa_cmd_start() {
  printf '\033]133;C\007'
}

__kissa_cmd_end() {
  local ec=$?
  printf '\033]133;D;%s\007' "$ec"
}

if [[ -z "$__KISSA_BASH_INTEGRATED" ]]; then
  export __KISSA_BASH_INTEGRATED=1
  PROMPT_COMMAND="__kissa_cmd_end; __kissa_prompt_start; ${PROMPT_COMMAND:-}"
  PS1="\$(__kissa_prompt_end)$PS1"
  trap '__kissa_cmd_start' DEBUG
fi
