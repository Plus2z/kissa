# Liminal Shell Integration for Zsh
# Injects OSC 133 semantic markers (A/B/C/D) via precmd and preexec hooks.

if [[ -z "$__LIMINAL_ZSH_INTEGRATED" ]]; then
  export __LIMINAL_ZSH_INTEGRATED=1
  setopt PROMPT_SUBST

  __liminal_last_exit=0
  __liminal_cmd_executed=0

  __liminal_preexec() {
    __liminal_cmd_executed=1
    printf '\033]133;C\007'
  }

  __liminal_precmd() {
    __liminal_last_exit=$?
    if [[ $__liminal_cmd_executed -eq 1 ]]; then
      printf '\033]133;D;%s\007' "$__liminal_last_exit"
      __liminal_cmd_executed=0
    fi
    printf '\033]133;A;%s\007' "$PWD"
  }

  autoload -Uz add-zsh-hook
  add-zsh-hook precmd __liminal_precmd
  add-zsh-hook preexec __liminal_preexec

  PS1='%{\033]133;B\007%}'"$PS1"
fi
