# Kissa Shell Integration for Zsh
# Injects OSC 133 semantic markers (A/B/C/D) via precmd and preexec hooks.

if [[ -z "$__KISSA_ZSH_INTEGRATED" ]]; then
  export __KISSA_ZSH_INTEGRATED=1
  setopt PROMPT_SUBST

  __kissa_last_exit=0
  __kissa_cmd_executed=0

  __kissa_preexec() {
    __kissa_cmd_executed=1
    printf '\033]133;C\007'
  }

  __kissa_precmd() {
    __kissa_last_exit=$?
    if [[ $__kissa_cmd_executed -eq 1 ]]; then
      printf '\033]133;D;%s\007' "$__kissa_last_exit"
      __kissa_cmd_executed=0
    fi
    printf '\033]133;A;%s\007' "$PWD"
  }

  autoload -Uz add-zsh-hook
  add-zsh-hook precmd __kissa_precmd
  add-zsh-hook preexec __kissa_preexec

  PS1='%{\033]133;B\007%}'"$PS1"
fi
