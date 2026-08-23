# Kissa Shell Integration for Fish
# Injects OSC 133 semantic markers (A/B/C/D) via fish event handlers and prompt wrapper.

if not set -q __KISSA_FISH_INTEGRATED
    set -gx __KISSA_FISH_INTEGRATED 1

    function __kissa_preexec --on-event fish_preexec
        printf '\033]133;C\007'
    end

    function __kissa_postexec --on-event fish_postexec
        printf '\033]133;D;%s\007' $status
    end

    functions -c fish_prompt __kissa_orig_fish_prompt
    function fish_prompt
        printf '\033]133;A;%s\007' "$PWD"
        __kissa_orig_fish_prompt
        printf '\033]133;B\007'
    end
end
