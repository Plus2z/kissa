# Liminal Shell Integration for Bash
# Injects OSC 133 semantic markers (A/B/C/D) to delimit command lifecycles.

__liminal_prompt_start() {
  printf '\033]133;A;%s\007' "$PWD"
}

__liminal_prompt_end() {
  printf '\033]133;B\007'
}

__liminal_cmd_start() {
  printf '\033]133;C\007'
}

__liminal_cmd_end() {
  local ec=$?
  printf '\033]133;D;%s\007' "$ec"
}

if [[ -z "$__LIMINAL_BASH_INTEGRATED" ]]; then
  export __LIMINAL_BASH_INTEGRATED=1
  PROMPT_COMMAND="__liminal_cmd_end; __liminal_prompt_start; ${PROMPT_COMMAND:-}"
  PS1="\$(__liminal_prompt_end)$PS1"
  trap '__liminal_cmd_start' DEBUG
fi
