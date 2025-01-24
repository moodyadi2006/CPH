class Solution(object):
    def reverse(self, x):
        neg = x < 0
        string = str(x)[::-1] if not neg else str(x)[:0:-1]
        result = int(string)
        if neg:
            result = -result
        if result < -2**31 or result > 2**31 - 1:
            return 0
        return result

# Test cases
if __name__ == "__main__":
    solution = Solution()
        # Test case 1
    print(solution.reverse( 123))
    # Test case 2
    print(solution.reverse( -123))
    # Test case 3
    print(solution.reverse( 120))
