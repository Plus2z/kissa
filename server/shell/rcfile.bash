# ---- kissa shell integration (sourced by bash --rcfile) ----
if [ -f ~/.bashrc ]; then . ~/.bashrc; fi

# hook 1(排队首):抢先捕获用户命令的真实退出码。
# 不能只靠排队尾的 hook,因为动态提示符框架(starship 等)的 hook 也会改 $?。
__terminal_chat_capture() { __terminal_chat_ec=$?; }

# hook 2(排队尾):所有框架都跑完后再干活——
#   - 发 D(退出码)与 A(cwd)标记
#   - 给可能被框架动态重写的 PS1 补上 B 标记(幂等)
__terminal_chat_precmd() {
  printf '\033]133;D;%s\007' "${__terminal_chat_ec:-0}"
  printf '\033]133;A;%s\007' "$PWD"
  case "$PS1" in
    *"]133;B"*) ;;
    *) PS1="$PS1\[\e]133;B\a\]" ;;
  esac
}

PROMPT_COMMAND="__terminal_chat_capture${PROMPT_COMMAND:+;$PROMPT_COMMAND};__terminal_chat_precmd"

# PS0 在命令被接受、执行前展开;框架一般不动它
PS0=$'\033]133;C\007'
# ---- end kissa shell integration ----
