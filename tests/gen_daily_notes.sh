#!/bin/bash
# run this in your vault root
FOLDER="100 Journal"
mkdir -p "$FOLDER"

START_DATE="2025-10-30"
END_DATE="2026-04-29"

start_sec=$(date -d "$START_DATE" +%s)
end_sec=$(date -d "$END_DATE" +%s)
day_sec=86400
midpoint=$(( end_sec - (90 * day_sec) ))
pr_threshold=$(( end_sec - (20 * day_sec) ))

# individual lazy counters for each habit
EX_LAZY=0; MED_LAZY=0; UNI_LAZY=0; RES_LAZY=0; LANG_LAZY=0; TASK_LAZY=0
# tracking for cannabis sober streak
CAN_DAYS=0
# tracking for bad mood weeks
BAD_WEEK_REMAINING=0

for (( cur=$start_sec; cur<=$end_sec; cur+=$day_sec )); do
    DATE=$(date -d "@$cur" +%Y-%m-%d)
    DOW=$(date -d "@$cur" +%u)

    # mood & sleep phase logic
    if [ $cur -ge $midpoint ]; then
        MOOD_BASE=4.5; SLEEP_BASE=7.2
    else
        MOOD_BASE=3.5; SLEEP_BASE=6.5
    fi

    # global "bad week" generator (affects mood/sleep)
    if [ $BAD_WEEK_REMAINING -gt 0 ]; then
        ((BAD_WEEK_REMAINING--))
        MOOD_MOD=-1.5; SLEEP_MOD=-1.0
    else
        if (( RANDOM % 100 < 5 )); then BAD_WEEK_REMAINING=$(( RANDOM % 5 + 2 )); fi
        MOOD_MOD=0; SLEEP_MOD=0
    fi

    MOOD=$(echo "$MOOD_BASE + $MOOD_MOD + ( ( $RANDOM % 3 ) - 1 )" | bc)
    MOOD=${MOOD%.*}; [[ $MOOD -lt 1 ]] && MOOD=1; [[ $MOOD -gt 7 ]] && MOOD=7

    SLEEP=$(echo "$SLEEP_BASE + $SLEEP_MOD + ( ( $RANDOM % 3 ) - 1 )" | bc)
    SLEEP=${SLEEP%.*}; [[ $DOW -eq 1 ]] && ((SLEEP--)); [[ $DOW -eq 6 ]] && ((SLEEP+=2))
    [[ $SLEEP -lt 2 ]] && SLEEP=2; [[ $SLEEP -gt 10 ]] && SLEEP=10

    # individual habit generator
    # args: current_lazy_var, base_mins
    gen_h() {
        local lazy_var_name=$1
        local base=$2
        local remaining_lazy=${!lazy_var_name}

        # if in a slump, return 0
        if [ $remaining_lazy -gt 0 ]; then
            eval "$lazy_var_name=$(( remaining_lazy - 1 ))"
            echo 0; return
        fi

        # 6% chance to start an individual slump (2-4 days)
        if (( RANDOM % 100 < 6 )); then
            eval "$lazy_var_name=$(( RANDOM % 3 + 1 ))"
            echo 0; return
        fi

        # weighted effort randomization
        local roll=$(( RANDOM % 100 ))
        if [ $roll -lt 20 ]; then echo 0; # 20% skip day
        elif [ $roll -lt 50 ]; then echo $(( RANDOM % 10 + 1 )); # 30% low effort (<10m)
        else 
            # 50% normal effort
            local val=$(( base + (RANDOM % 30 - 15) ))
            echo $(( val < 1 ? 1 : val ))
        fi
    }

    # calculate habits independently
    EX=$(gen_h "EX_LAZY" 40)
    MED=$(gen_h "MED_LAZY" 15)
    RES=$(gen_h "RES_LAZY" 45)
    LANG=$(gen_h "LANG_LAZY" 25)
    TASK=$(gen_h "TASK_LAZY" 2)

    # uni_study with PR override
    if [ $cur -ge $pr_threshold ]; then
        UNI=$(( 125 + (RANDOM % 30) ))
    else
        UNI=$(gen_h "UNI_LAZY" 50)
    fi

    # cannabis logic (at least once every 14 days)
    ((CAN_DAYS++))
    CANNABIS=0
    if [ $CAN_DAYS -ge 13 ] || { [ $cur -lt $midpoint ] && (( RANDOM % 100 < 10 )); }; then
        CANNABIS=1
        CAN_DAYS=0
    fi

    # cleanup
    [[ $TASK -gt 4 ]] && TASK=4
    COFFEE=$(( RANDOM % 2 )); [[ $DOW -le 5 ]] && ((COFFEE++)); [[ $SLEEP -lt 6 ]] && ((COFFEE+=2))
    [[ $COFFEE -gt 4 ]] && COFFEE=4

    M_MOOD=$MOOD; [[ $(( RANDOM % 20 )) -eq 0 ]] && M_MOOD=""
    M_SLEEP=$SLEEP; [[ $(( RANDOM % 25 )) -eq 0 ]] && M_SLEEP=""

    # 5. write
    cat <<EOF > "$FOLDER/$DATE.md"
---
mood: $M_MOOD
sleep: $M_SLEEP
coffee: $COFFEE
cannabis: $CANNABIS
exercise: $EX
meditation: $MED
uni_study: $UNI
daily_task: $TASK
research: $RES
language: $LANG
---
EOF
done

echo "Success. Daily notes generated."