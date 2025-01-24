class Solution:
    def addTwoNumbers(self, l1, l2):
        carry = 0
        result = []

        # Make sure the lists are of equal length by padding the shorter one with zeros
        while len(l1) < len(l2):
            l1.append(0)
        while len(l2) < len(l1):
            l2.append(0)

        # Add corresponding digits from both lists
        for i in range(len(l1)):
            total = l1[i] + l2[i] + carry
            carry, digit = divmod(total, 10)  # Calculate digit and carry
            result.append(digit)  # Append the current digit to the result

        # If there's a carry left after the final addition, append it to the result
        if carry:
            result.append(carry)

        return f"[{','.join(map(str, result))}]"

# Test cases
if __name__ == "__main__":
    solution = Solution()
        # Test case 1
    print(solution.addTwoNumbers([2,4,3], [5,6,4]))
    # Test case 2
    print(solution.addTwoNumbers([0], [0]))
    # Test case 3
    print(solution.addTwoNumbers([9,9,9,9,9,9,9], [9,9,9,9]))
